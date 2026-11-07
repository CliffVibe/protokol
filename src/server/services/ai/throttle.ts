import "server-only";

// Мягкий лимит частоты помощника (T12, замечание security-reviewer): 60 запросов в минуту на пользователя —
// и для ответов без ИИ (каждый — несколько запросов к БД). Живой человек столько не спросит; цикл скрипта — да.
// В памяти процесса: при нескольких копиях приложения лимит на копию — для концепта достаточно,
// главный лимит S8 (20 вызовов GigaChat в час) — в БД (repos/assistant.ts). Чистая функция с часами
// параметром (tests/unit/assistant.test.ts).

export const REQUESTS_PER_MINUTE = 60;
const WINDOW_MS = 60_000;
/** Не копим память: старые пользователи выкидываются, когда записей слишком много */
const MAX_USERS = 10_000;

export function createThrottle(limit = REQUESTS_PER_MINUTE, windowMs = WINDOW_MS) {
  const hits = new Map<string, number[]>();
  return (key: string, now = Date.now()): boolean => {
    const since = now - windowMs;
    const recent = (hits.get(key) ?? []).filter((t) => t > since);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.delete(key);
    hits.set(key, recent);
    if (hits.size > MAX_USERS) {
      const oldest = hits.keys().next().value;
      if (oldest !== undefined) hits.delete(oldest);
    }
    return true;
  };
}

export const allowRequest = createThrottle();
