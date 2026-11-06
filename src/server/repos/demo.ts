import "server-only";
import { db } from "@/server/db";
import { runSeed } from "../../../prisma/run-seed";
import type { StaffCtx } from "./auth";

// «Сбросить демо» (T08): та же логика, что у `pnpm db:reset-demo` и ночного cron, — полный пересев
// вымышленных данных от текущей даты. Пароли демо-аккаунтов — из process.env на сервере (S2, S4).
// Вызывается только из resetDemoAction: сотрудник + DEMO_MODE=1 проверены там.

/**
 * Не чаще раза в 5 минут (security-reviewer, T08): при DEMO_MODE=1 «Войти как Ирина» не требует пароля,
 * а сброс выкидывает из системы всех, включая жюри, и считает ~10 хешей argon2. Счётчик — в памяти
 * процесса: на проде один контейнер приложения; после перезапуска пауза начинается заново.
 */
export const RESET_COOLDOWN_MS = 5 * 60 * 1000;
let lastResetAt = 0;

export type ResetResult = { ok: true } | { ok: false; retryInMinutes: number };

export async function resetDemoData(ctx: StaffCtx, now = Date.now()): Promise<ResetResult> {
  const wait = lastResetAt + RESET_COOLDOWN_MS - now;
  if (wait > 0) return { ok: false, retryInMinutes: Math.ceil(wait / 60_000) };
  lastResetAt = now;
  await runSeed(db, { now: new Date(now) });
  return { ok: true };
}
