import "server-only";
import { randomUUID } from "node:crypto";
import type { AiProvider, ChatMessage } from "./provider";

// GigaChat (T12) — без SDK, обычным fetch: OAuth-токен по ключу авторизации + потоковый ответ (SSE).
// TLS: серверы Сбера подписаны «Russian Trusted Root CA» Минцифры. Сертификат лежит в certs/ и в образе,
// Node берёт его из NODE_EXTRA_CA_CERTS. Проверку TLS не отключаем нигде (ни rejectUnauthorized,
// ни NODE_TLS_REJECT_UNAUTHORIZED): без сертификата запрос просто упадёт, и помощник ответит по FAQ.
// Ключ и токен — только в заголовках запроса; в ошибки и логи попадают лишь код и стадия.

const OAUTH_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
const CHAT_URL = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions";
export const GIGACHAT_MODEL = "GigaChat-2";
const TIMEOUT_MS = 20_000;
/** Токен живёт 30 минут; обновляем за минуту до конца */
const TOKEN_MARGIN_MS = 60_000;

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export class GigaChatError extends Error {
  constructor(
    readonly stage: "oauth" | "chat" | "stream",
    readonly code: string,
  ) {
    super(`GigaChat ${stage}: ${code}`);
    this.name = "GigaChatError";
  }
}

/** Причина сетевой ошибки без подробностей запроса: «tls» — нет сертификата Минцифры. */
function networkCode(e: unknown): string {
  if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
    return e.name === "TimeoutError" ? "timeout" : "aborted";
  }
  const cause = (e as { cause?: { code?: unknown } } | null)?.cause?.code;
  if (typeof cause === "string") {
    return /CERT|SELF_SIGNED|ISSUER/.test(cause) ? `tls:${cause}` : cause;
  }
  return "network";
}

type Token = { value: string; expiresAt: number };

export type GigaChatOptions = {
  authKey: string;
  scope: string;
  fetch?: FetchLike;
  now?: () => number;
};

export function createGigaChat(opts: GigaChatOptions): AiProvider {
  const doFetch: FetchLike = opts.fetch ?? ((input, init) => fetch(input, init));
  const now = opts.now ?? Date.now;
  let token: Token | null = null;

  async function call(stage: "oauth" | "chat", url: string, init: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await doFetch(url, init);
    } catch (e) {
      throw new GigaChatError(stage, networkCode(e));
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      throw new GigaChatError(stage, `http:${res.status}`);
    }
    return res;
  }

  async function accessToken(signal: AbortSignal, force = false): Promise<string> {
    if (!force && token && token.expiresAt - TOKEN_MARGIN_MS > now()) return token.value;
    const res = await call("oauth", OAUTH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        rqUID: randomUUID(),
        authorization: `Basic ${opts.authKey}`,
      },
      body: new URLSearchParams({ scope: opts.scope }).toString(),
      signal,
    });
    const json = (await res.json().catch(() => null)) as {
      access_token?: unknown;
      expires_at?: unknown;
    } | null;
    if (typeof json?.access_token !== "string" || typeof json.expires_at !== "number") {
      throw new GigaChatError("oauth", "bad_response");
    }
    token = { value: json.access_token, expiresAt: json.expires_at };
    return token.value;
  }

  return {
    name: "gigachat",
    async *stream(messages: ChatMessage[], outer: AbortSignal) {
      const signal = AbortSignal.any([outer, AbortSignal.timeout(TIMEOUT_MS)]);
      const body = JSON.stringify({
        model: GIGACHAT_MODEL,
        messages,
        stream: true,
        temperature: 0.2,
        max_tokens: 600,
      });
      const request = async (force: boolean) =>
        call("chat", CHAT_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "text/event-stream",
            authorization: `Bearer ${await accessToken(signal, force)}`,
          },
          body,
          signal,
        });
      let res: Response;
      try {
        res = await request(false);
      } catch (e) {
        // Токен отозвали раньше срока — один повтор с новым
        if (e instanceof GigaChatError && e.stage === "chat" && e.code === "http:401") {
          res = await request(true);
        } else throw e;
      }
      if (!res.body) throw new GigaChatError("stream", "no_body");
      try {
        for await (const piece of parseSse(res.body)) yield piece;
      } catch (e) {
        if (e instanceof GigaChatError) throw e;
        throw new GigaChatError("stream", networkCode(e));
      }
    },
  };
}

/**
 * SSE GigaChat: строки «data: {json}», конец — «data: [DONE]». Кусок сети может оборвать строку где угодно,
 * поэтому копим буфер до перевода строки. Текст — choices[0].delta.content.
 */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = done ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        let json: unknown;
        try {
          json = JSON.parse(data);
        } catch {
          throw new GigaChatError("stream", "bad_json");
        }
        const content = (json as { choices?: { delta?: { content?: unknown } }[] }).choices?.[0]
          ?.delta?.content;
        if (typeof content === "string" && content) yield content;
      }
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}
