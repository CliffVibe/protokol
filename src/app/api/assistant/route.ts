import { z } from "zod";
import { requireStudent } from "@/server/auth/guards";
import { answer, type AssistantEvent } from "@/server/services/ai/assistant";
import { MAX_HISTORY, MAX_MESSAGE } from "@/server/services/ai/prompt";
import { allowRequest } from "@/server/services/ai/throttle";

// Помощник (T12, S8). Guard — первой строкой: кто спрашивает, знает только сессия; id студента в теле нет
// и быть не может (схема ниже его не принимает). Без входа requireStudent() уводит на /login.
// Тело — только реплики разговора (≤ 6 по 1000 символов), каждая проверяется zod; роль system клиенту
// недоступна. Ответ — NDJSON: {"t":"delta","v":"…"}… {"t":"done","mode":"ai"|"faq","actions":[…]}.
export const dynamic = "force-dynamic";

const MAX_BODY = 16 * 1024;

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(MAX_MESSAGE),
      }),
    )
    .min(1)
    .max(MAX_HISTORY)
    .refine((m) => m.at(-1)?.role === "user"),
});

/**
 * Тело по кусочкам с подсчётом БАЙТОВ: без Content-Length (chunked) или с заниженным заголовком
 * req.text() сначала взял бы в память всё (security-reviewer T12). Больше лимита → null и обрыв чтения.
 */
async function readLimited(req: Request, max: number): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

const fail = (status: number) =>
  new Response(null, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  const ctx = await requireStudent();

  // Чужой сайт не отправит запрос с нашей cookie (SameSite=Lax), но и Origin, если он есть, должен быть свой
  const origin = req.headers.get("origin");
  if (origin) {
    let sameHost = false;
    try {
      sameHost = new URL(origin).host === req.headers.get("host");
    } catch {
      sameHost = false;
    }
    if (!sameHost) return fail(403);
  }
  if (!req.headers.get("content-type")?.startsWith("application/json")) return fail(415);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return fail(413);
  // Частота — до тела и до БД: и ответы по базе не бесплатны (4 запроса к БД), security-reviewer T12
  if (!allowRequest(ctx.userId)) return fail(429);

  const raw = await readLimited(req, MAX_BODY);
  if (raw === null) return fail(413);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail(400);
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return fail(400);

  const encoder = new TextEncoder();
  const line = (e: AssistantEvent) => encoder.encode(`${JSON.stringify(e)}\n`);
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort(), { once: true });
  const events = answer(ctx, parsed.data.messages, abort.signal);

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await events.next();
        if (done) controller.close();
        else controller.enqueue(line(value));
      } catch {
        // Сбой до модели (БД, контекст) — без подробностей: клиент покажет «Не получилось получить ответ»
        controller.enqueue(encoder.encode(`${JSON.stringify({ t: "error" })}\n`));
        controller.close();
      }
    },
    async cancel() {
      abort.abort();
      await events.return(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
