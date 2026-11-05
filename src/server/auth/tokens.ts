// Токен сессии и параметры cookie (docs/05-security.md → S3). Чистые функции — без БД и без Next.
import { createHash, randomBytes } from "node:crypto";

/** Префикс __Host-: браузер примет cookie только с Secure, Path=/ и без Domain — её не подменит поддомен. */
export const SESSION_COOKIE = "__Host-session";

/** Срок сессии — 7 дней, продлевается при активности. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Продлеваем не чаще раза в сутки: не пишем в БД на каждый запрос. */
export const SESSION_REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

/** Флаги cookie сессии. Secure и на localhost: браузеры считают http://localhost безопасным контекстом. */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
} as const;

// 32 байта в base64url — ровно 43 символа без «=». Всё остальное в cookie — мусор, в БД не ходим.
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isWellFormedToken(token: string | undefined | null): token is string {
  return typeof token === "string" && TOKEN_RE.test(token);
}

/** В БД лежит только sha256(token): утечка таблицы сессий не даёт войти. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
