// GigaChat без SDK (T12): OAuth-токен, кэш токена, повтор при 401, разбор SSE с разрывами,
// ключ не попадает в текст ошибки. Сеть подменяется: настоящий fetch здесь не вызывается.
import { describe, expect, it } from "vitest";
import { createGigaChat, GigaChatError, parseSse } from "@/server/services/ai/gigachat";

const KEY = "dGVzdC1rZXktbm90LXJlYWw="; // gitleaks:allow — base64("test-key-not-real"): проверяем, что ключ не утекает

const sse = (chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      const enc = new TextEncoder();
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });

const delta = (s: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: s } }] })}\n\n`;

type Call = { url: string; init: RequestInit };

function fakeFetch(script: (call: Call, n: number) => Response) {
  const calls: Call[] = [];
  const fn = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return script({ url, init }, calls.length);
  };
  return { fn, calls };
}

const oauthOk = (expiresAt: number) =>
  Response.json({ access_token: "tok-1", expires_at: expiresAt });

async function collect(it: AsyncIterable<string>) {
  let s = "";
  for await (const p of it) s += p;
  return s;
}

describe("разбор SSE", () => {
  it("строки, разорванные посреди JSON и посреди UTF-8, собираются; [DONE] — конец", async () => {
    const full =
      delta("При") + delta("вет, ") + delta("Алиса") + "data: [DONE]\n\n" + delta("лишнее");
    const bytes = new TextEncoder().encode(full);
    // режем по байтам, в том числе внутри двухбайтовых кириллических символов
    const parts: Uint8Array[] = [];
    for (let i = 0; i < bytes.length; i += 7) parts.push(bytes.slice(i, i + 7));
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (const p of parts) c.enqueue(p);
        c.close();
      },
    });
    expect(await collect(parseSse(body))).toBe("Привет, Алиса");
  });

  it("битый JSON — ошибка потока", async () => {
    await expect(collect(parseSse(sse(["data: {oops\n\n"])))).rejects.toThrow(GigaChatError);
  });
});

describe("клиент GigaChat", () => {
  const now = 1_000_000;

  it("OAuth с Basic-ключом и scope, затем чат с Bearer; токен переиспользуется", async () => {
    const { fn, calls } = fakeFetch(({ url }) =>
      url.includes("oauth")
        ? oauthOk(now + 30 * 60_000)
        : new Response(sse([delta("ок"), "data: [DONE]\n\n"])),
    );
    const g = createGigaChat({
      authKey: KEY,
      scope: "GIGACHAT_API_PERS",
      fetch: fn,
      now: () => now,
    });
    const signal = new AbortController().signal;
    expect(await collect(g.stream([{ role: "user", content: "привет" }], signal))).toBe("ок");
    expect(await collect(g.stream([{ role: "user", content: "ещё" }], signal))).toBe("ок");

    expect(calls.map((c) => (c.url.includes("oauth") ? "oauth" : "chat"))).toEqual([
      "oauth",
      "chat",
      "chat",
    ]);
    const oauth = calls[0]!;
    const h = new Headers(oauth.init.headers);
    expect(h.get("authorization")).toBe(`Basic ${KEY}`);
    expect(h.get("rquid")).toMatch(/^[0-9a-f-]{36}$/);
    expect(String(oauth.init.body)).toBe("scope=GIGACHAT_API_PERS");
    const chat = calls[1]!;
    expect(new Headers(chat.init.headers).get("authorization")).toBe("Bearer tok-1");
    const body = JSON.parse(String(chat.init.body)) as { model: string; stream: boolean };
    expect(body).toMatchObject({ model: "GigaChat-2", stream: true });
    // все запросы — только на серверы Сбера по https
    expect(calls.every((c) => c.url.startsWith("https://") && c.url.includes(".sberbank.ru"))).toBe(
      true,
    );
  });

  it("токен истекает → новый OAuth", async () => {
    let t = now;
    const { fn, calls } = fakeFetch(({ url }) =>
      url.includes("oauth") ? oauthOk(t + 30 * 60_000) : new Response(sse(["data: [DONE]\n"])),
    );
    const g = createGigaChat({ authKey: KEY, scope: "S", fetch: fn, now: () => t });
    const signal = new AbortController().signal;
    await collect(g.stream([], signal));
    t += 30 * 60_000;
    await collect(g.stream([], signal));
    expect(calls.filter((c) => c.url.includes("oauth"))).toHaveLength(2);
  });

  it("чат ответил 401 → один повтор с новым токеном", async () => {
    const { fn, calls } = fakeFetch(({ url }, n) =>
      url.includes("oauth")
        ? oauthOk(now + 30 * 60_000)
        : n === 2
          ? new Response(null, { status: 401 })
          : new Response(sse([delta("да"), "data: [DONE]\n"])),
    );
    const g = createGigaChat({ authKey: KEY, scope: "S", fetch: fn, now: () => now });
    expect(await collect(g.stream([], new AbortController().signal))).toBe("да");
    expect(calls.map((c) => (c.url.includes("oauth") ? "o" : "c")).join("")).toBe("ococ");
  });

  it("ошибки — код и стадия, без ключа и без тела ответа", async () => {
    const cases: [() => Promise<Response>, RegExp][] = [
      [async () => new Response("secret body " + KEY, { status: 429 }), /oauth: http:429/],
      [
        async () => {
          throw new TypeError("fetch failed", {
            cause: { code: "UNABLE_TO_GET_ISSUER_CERT_LOCALLY" },
          });
        },
        /oauth: tls:UNABLE_TO_GET_ISSUER_CERT_LOCALLY/,
      ],
      [async () => Response.json({ nope: true }), /oauth: bad_response/],
    ];
    for (const [respond, re] of cases) {
      const g = createGigaChat({ authKey: KEY, scope: "S", fetch: respond, now: () => now });
      const err = await collect(g.stream([], new AbortController().signal)).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(GigaChatError);
      expect(String((err as Error).message)).toMatch(re);
      expect(String((err as Error).message)).not.toContain(KEY);
      expect(JSON.stringify(err)).not.toContain(KEY);
    }
  });
});
