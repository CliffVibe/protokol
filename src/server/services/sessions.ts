import "server-only";
import type { Role } from "@/generated/prisma/client";
import {
  deleteExpiredSessions,
  deleteSession,
  deleteUserSessions,
  extendSession,
  findSession,
  insertSession,
} from "@/server/repos/auth";
import {
  SESSION_REFRESH_AFTER_MS,
  SESSION_TTL_MS,
  generateSessionToken,
  hashSessionToken,
  isWellFormedToken,
} from "@/server/auth/tokens";

// Сессии без привязки к Next (cookie ставит src/server/auth/session.ts) — так их можно проверить
// интеграционным тестом на настоящей БД с подменой «сейчас».

export type SessionUser = { userId: string; role: Role };

/** Новая сессия: токен уходит в cookie, в БД — только его sha256 (S3). */
export async function startSession(
  userId: string,
  now: Date,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await insertSession(hashSessionToken(token), userId, expiresAt);
  await deleteExpiredSessions(userId, now);
  return { token, expiresAt };
}

/** Кто владелец токена. Истёкшая или чужая форма токена — null. Продлевает срок раз в сутки. */
export async function resolveSession(
  token: string | undefined,
  now: Date,
): Promise<SessionUser | null> {
  if (!isWellFormedToken(token)) return null;
  const id = hashSessionToken(token);
  const s = await findSession(id);
  if (!s) return null;
  if (s.expiresAt.getTime() <= now.getTime()) {
    await deleteSession(id);
    return null;
  }
  const left = s.expiresAt.getTime() - now.getTime();
  if (left < SESSION_TTL_MS - SESSION_REFRESH_AFTER_MS) {
    await extendSession(id, new Date(now.getTime() + SESSION_TTL_MS));
  }
  return { userId: s.user.id, role: s.user.role };
}

export async function endSession(token: string | undefined): Promise<void> {
  if (!isWellFormedToken(token)) return;
  await deleteSession(hashSessionToken(token));
}

/** «Выйти на всех устройствах» и смена пароля (S3). */
export async function endAllSessions(userId: string): Promise<void> {
  await deleteUserSessions(userId);
}
