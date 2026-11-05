import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Role } from "@/generated/prisma/client";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { demoLoginSchema, loginFieldsSchema, loginLimitsSchema } from "@/server/auth/schemas";
import {
  clearThrottle,
  findLoginCandidate,
  findThrottle,
  findUserByLogin,
  saveThrottle,
} from "@/server/repos/auth";

// Проверка логина и пароля (docs/05-security.md → S2).
//
// Блокировка считается по паре «логин + IP», а не по аккаунту (решение T03 по security-ревью T02):
// логины жюри публичные, и блокировка на аккаунт позволила бы любому постороннему запереть их вход.
// Перебор с одного IP по-прежнему упирается в 5 попыток за 15 минут на логин → 5 минут блокировки.

export const MAX_FAILURES = 5;
export const LOCK_MS = 5 * 60 * 1000;
export const FAILURE_WINDOW_MS = 15 * 60 * 1000;
/** Небольшая задержка после неудачи (S2: «+ задержка») — замедляет перебор. */
export const FAILURE_DELAY_MS = 400;

export type FieldErrors = Partial<Record<"login" | "password", string>>;

export type AuthResult =
  | { ok: true; userId: string; role: Role }
  | { ok: false; reason: "fields"; fieldErrors: FieldErrors }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "locked" };

// Фиктивный argon2id-хеш для «нет такого логина»: проверка пароля идёт всегда, и по времени ответа
// не понять, существует ли логин (security-ревью T02). Считаем один раз, сразу при загрузке модуля.
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(32).toString("base64url"));
  return dummyHash;
}
void getDummyHash().catch(() => {
  dummyHash = undefined;
});

/** Ключ счётчика: sha256 — в БД нет ни логина, ни IP в открытом виде. */
export function throttleKey(login: string, ip: string): string {
  return createHash("sha256").update(`${login}\n${ip}`).digest("hex");
}

export function normalizeLogin(login: string): string {
  return login.trim().toLowerCase();
}

type AuthOptions = { now?: Date; failureDelayMs?: number };

export async function authenticate(
  input: { login: unknown; password: unknown },
  ip: string,
  { now = new Date(), failureDelayMs = FAILURE_DELAY_MS }: AuthOptions = {},
): Promise<AuthResult> {
  const fields = loginFieldsSchema.safeParse(input);
  if (!fields.success) {
    const fieldErrors: FieldErrors = {};
    for (const issue of fields.error.issues) {
      const key = issue.path[0];
      if ((key === "login" || key === "password") && !fieldErrors[key]) {
        fieldErrors[key] = key === "login" ? "Введите логин" : "Введите пароль";
      }
    }
    return { ok: false, reason: "fields", fieldErrors };
  }

  const login = normalizeLogin(fields.data.login);
  const { password } = fields.data;
  const key = throttleKey(login, ip);

  // Слишком длинный ввод — сразу общий ответ, без argon2. В счётчик тоже идёт: это неудачная попытка.
  const withinLimits = loginLimitsSchema.safeParse({ login, password }).success;

  const throttle = await findThrottle(key);
  if (throttle?.lockedUntil && throttle.lockedUntil.getTime() > now.getTime()) {
    return { ok: false, reason: "locked" };
  }

  let userId: string | null = null;
  let role: Role | null = null;
  if (withinLimits) {
    const user = await findLoginCandidate(login);
    // Нет логина — всё равно проверяем пароль, но с фиктивным хешем: время ответа одинаковое.
    const valid = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), password);
    if (user && valid) {
      userId = user.id;
      role = user.role;
    }
  }

  if (userId && role) {
    if (throttle) await clearThrottle(key);
    return { ok: true, userId, role };
  }

  const locked = await registerFailure(key, throttle, now);
  if (failureDelayMs > 0) await new Promise((r) => setTimeout(r, failureDelayMs));
  return locked ? { ok: false, reason: "locked" } : { ok: false, reason: "invalid" };
}

/** +1 неудача; на 5-й в окне — блокировка на 5 минут. Возвращает true, если только что заблокировали. */
async function registerFailure(
  key: string,
  prev: Awaited<ReturnType<typeof findThrottle>>,
  now: Date,
): Promise<boolean> {
  const windowExpired =
    !prev || now.getTime() - prev.windowStart.getTime() > FAILURE_WINDOW_MS || !!prev.lockedUntil;
  const failures = windowExpired ? 1 : prev.failures + 1;
  const windowStart = windowExpired ? now : prev.windowStart;

  if (failures >= MAX_FAILURES) {
    await saveThrottle(key, {
      failures: 0,
      windowStart: now,
      lockedUntil: new Date(now.getTime() + LOCK_MS),
    });
    return true;
  }
  await saveThrottle(key, { failures, windowStart, lockedUntil: null });
  return false;
}

// ── Демо-вход «Войти как…» (docs/06-seed-data.md) ─────────────────────────

/** Проверяется только на сервере: кнопки на /login — лишь удобство. */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "1";
}

/** Вход без пароля для фиксированного списка демо-логинов и только при DEMO_MODE=1. */
export async function authenticateDemo(
  input: unknown,
): Promise<{ ok: true; userId: string; role: Role } | { ok: false }> {
  if (!isDemoMode()) return { ok: false };
  const parsed = demoLoginSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const user = await findUserByLogin(parsed.data.login);
  return user ? { ok: true, userId: user.id, role: user.role } : { ok: false };
}
