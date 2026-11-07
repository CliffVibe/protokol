import "server-only";

// Провайдер ИИ (T12): интерфейс и выбор по окружению. Реализация GigaChat — gigachat.ts; «FAQ без ИИ» —
// это отсутствие провайдера (null): ответ собирают правила и поиск по базе (assistant.ts).
// Ключ читается только здесь и в gigachat.ts, только на сервере (S4): ни NEXT_PUBLIC_, ни передачи в клиент.

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export interface AiProvider {
  readonly name: "gigachat" | "test";
  /** Поток кусочков текста ответа. Ошибка — исключение (assistant.ts переключится на FAQ). */
  stream(messages: ChatMessage[], signal: AbortSignal): AsyncIterable<string>;
}

export type ProviderEnv = {
  GIGACHAT_AUTH_KEY?: string | undefined;
  GIGACHAT_SCOPE?: string | undefined;
  /** "faq" — принудительно без ИИ (e2e: ответы детерминированы и не тратят токены) */
  ASSISTANT_PROVIDER?: string | undefined;
};

export type ProviderChoice = { kind: "gigachat"; authKey: string; scope: string } | { kind: "faq" };

export function chooseProvider(env: ProviderEnv): ProviderChoice {
  if (env.ASSISTANT_PROVIDER === "faq") return { kind: "faq" };
  const authKey = env.GIGACHAT_AUTH_KEY?.trim();
  if (!authKey) return { kind: "faq" };
  return { kind: "gigachat", authKey, scope: env.GIGACHAT_SCOPE?.trim() || "GIGACHAT_API_PERS" };
}

/** Для страницы: показать ли пометку «отвечаю без ИИ». Сам ключ наружу не уходит — только да/нет. */
export function aiConfigured(env: ProviderEnv = serverEnv()): boolean {
  return chooseProvider(env).kind === "gigachat";
}

export function serverEnv(): ProviderEnv {
  return {
    GIGACHAT_AUTH_KEY: process.env["GIGACHAT_AUTH_KEY"],
    GIGACHAT_SCOPE: process.env["GIGACHAT_SCOPE"],
    ASSISTANT_PROVIDER: process.env["ASSISTANT_PROVIDER"],
  };
}
