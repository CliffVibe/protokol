// Хеширование паролей — только argon2id (docs/05-security.md → S2).
// Параметры — минимум OWASP Password Storage Cheat Sheet: m = 19 МиБ, t = 2, p = 1.
// Используется сидом (prisma/seed.ts) и входом (T03).
import { hash, verify } from "@node-rs/argon2";

// В @node-rs/argon2 `Algorithm` — const enum (недоступен при isolatedModules): Argon2id = 2.
// Что получился именно argon2id, проверяет tests/unit/password.test.ts по префиксу хеша.
const ARGON2ID = 2;

export const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19456, // КиБ = 19 МиБ
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  if (password.length === 0) throw new Error("Пустой пароль не хешируем");
  return hash(password, ARGON2_OPTIONS);
}

/** Не бросает на битом хеше: для входа это просто «неверный пароль». */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
