import { requireStudent } from "@/server/auth/guards";
import { renderCertificate } from "@/server/pdf/certificate";
import { certificateFileName, getMyCertificate } from "@/server/services/certificates";
import { requestNumberSchema } from "@/server/services/request-rules";

// PDF справки (T10) — только владелец. Номер из адреса — только формат (zod); чья заявка, решает
// репозиторий (WHERE number AND studentId = ctx, S1). Чужая, неготовая или отозванная → 404 без тела:
// не подтверждаем, что такая заявка есть. Файл генерируется на каждый запрос и не хранится.
export const dynamic = "force-dynamic";

const notFound = () =>
  new Response("Не найдено", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });

export async function GET(_req: Request, { params }: RouteContext<"/requests/[number]/pdf">) {
  const ctx = await requireStudent();
  let raw: string;
  try {
    raw = decodeURIComponent((await params).number);
  } catch {
    return notFound();
  }
  const number = requestNumberSchema.safeParse(raw);
  if (!number.success) return notFound();
  const data = await getMyCertificate(ctx, number.data);
  if (!data) return notFound();

  const pdf = await renderCertificate(data);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${certificateFileName(data.number)}"`,
      // Личный документ: не кладём в общие кэши и не храним в браузере
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
