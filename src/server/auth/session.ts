import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import {
  endAllSessions,
  endSession,
  resolveSession,
  startSession,
  type SessionUser,
} from "@/server/services/sessions";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "./tokens";

// Сессия в cookie __Host-session (S3). Ставить и удалять cookie можно только в Server Action
// или route handler; читать — где угодно на сервере.

/** Новая сессия. Прежняя из cookie (общий компьютер: А не вышел, Б вошёл поверх) удаляется из БД. */
export async function createSession(userId: string): Promise<void> {
  const store = await cookies();
  await endSession(store.get(SESSION_COOKIE)?.value);
  const { token, expiresAt } = await startSession(userId, new Date());
  store.set(SESSION_COOKIE, token, { ...SESSION_COOKIE_OPTIONS, expires: expiresAt });
}

/** Текущий пользователь по cookie. cache(): один запрос к БД на рендер, сколько бы guard ни звали. */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return resolveSession(token, new Date());
});

async function clearCookie(): Promise<void> {
  // Удаляем с теми же флагами: браузер не перезапишет __Host-cookie без Secure и Path=/
  (await cookies()).set(SESSION_COOKIE, "", { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
}

/** Выход: запись сессии удаляется из БД, а не только cookie (S3). */
export async function destroySession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await endSession(token);
  await clearCookie();
}

/** «Выйти на всех устройствах»: удаляются все сессии пользователя. */
export async function destroyAllSessions(userId: string): Promise<void> {
  await endAllSessions(userId);
  await clearCookie();
}
