import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Role } from "@/generated/prisma/client";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { demoLoginSchema, loginFieldsSchema, loginLimitsSchema } from "@/server/auth/schemas";
import {
  clearThrottle,
  findLoginCandidate,
  findUserByLogin,
  lockThrottle,
  pruneThrottles,
  reserveAttempt,
} from "@/server/repos/auth";
import { restoreDemoScenarios } from "@/server/repos/demo";
import { createThrottle } from "@/server/services/ai/throttle";

// Проверка логина и пароля (docs/05-security.md → S2).
//
// Блокировка считается по паре «логин + IP», а не по аккаунту (решение T03 по security-ревью T02):
// логины жюри публичные, и блокировка на аккаунт позволила бы любому постороннему запереть их вход.
// Перебор с одного IP по-прежнему упирается в 5 попыток за 15 минут на логин → 5 минут блокировки.
//
// Попытка «занимается» атомарно ДО проверки пароля (repos/auth.ts → reserveAttempt): параллельные
// запросы получают номера 1, 2, 3…, и пароль проверяют только первые пять (security-reviewer, T03).
// Ограничения решения — в docs/03-architecture.md → «Вход и сессии».

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

  // 1. Занять попытку — атомарно, до argon2. Блокировка действует или попытка сверх лимита — отказ сразу.
  const slot = await reserveAttempt(key, now, FAILURE_WINDOW_MS);
  if (slot.lockedUntil && slot.lockedUntil.getTime() > now.getTime()) {
    return { ok: false, reason: "locked" };
  }
  if (slot.attempt > MAX_FAILURES) {
    await lockThrottle(key, new Date(now.getTime() + LOCK_MS));
    return { ok: false, reason: "locked" };
  }

  // 2. Проверить пароль. Слишком длинный ввод — без argon2 (DoS), это просто неудачная попытка.
  //    Нет логина — проверяем фиктивным хешем: время ответа то же, что у неверного пароля.
  const withinLimits = loginLimitsSchema.safeParse({ login, password }).success;
  if (withinLimits) {
    const user = await findLoginCandidate(login);
    const valid = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), password);
    if (user && valid) {
      await clearThrottle(key);
      return { ok: true, userId: user.id, role: user.role };
    }
  }

  // 3. Неудача: на пятой попытке в окне — блокировка на 5 минут; старые счётчики подчищаем.
  const locked = slot.attempt >= MAX_FAILURES;
  if (locked) await lockThrottle(key, new Date(now.getTime() + LOCK_MS));
  await pruneThrottles(new Date(now.getTime() - FAILURE_WINDOW_MS - LOCK_MS), now);
  if (failureDelayMs > 0) await new Promise((r) => setTimeout(r, failureDelayMs));
  return locked ? { ok: false, reason: "locked" } : { ok: false, reason: "invalid" };
}

// ── Демо-вход «Войти как…» (docs/06-seed-data.md) ─────────────────────────

/** Проверяется только на сервере: кнопки на /login — лишь удобство. */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "1";
}

/**
 * Демо-входов в минуту с одного IP: каждый создаёт сессию в БД, а жюри столько не нажмёт.
 * Переменная окружения — только для e2e (все воркеры с одного адреса, playwright.config.ts).
 */
export const DEMO_LOGINS_PER_MINUTE = Number(process.env.DEMO_LOGINS_PER_MINUTE) || 20;
const allowDemoLogin = createThrottle(DEMO_LOGINS_PER_MINUTE, 60_000);

/**
 * Вход без пароля для фиксированного списка демо-логинов и только при DEMO_MODE=1.
 * Студенту заодно возвращаются одноразовые сценарии, которые прошлый эксперт уже прошёл (repos/demo.ts).
 */
export async function authenticateDemo(
  input: unknown,
  ip = "unknown",
  now = new Date(),
): Promise<{ ok: true; userId: string; role: Role } | { ok: false; reason: "invalid" | "wait" }> {
  if (!isDemoMode()) return { ok: false, reason: "invalid" };
  const parsed = demoLoginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  if (!allowDemoLogin(ip, now.getTime())) return { ok: false, reason: "wait" };
  const user = await findUserByLogin(parsed.data.login);
  if (!user) return { ok: false, reason: "invalid" };
  if (user.role === "STUDENT") await restoreDemoScenarios(user.id, now);
  return { ok: true, userId: user.id, role: user.role };
}
