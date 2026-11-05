import "server-only";
import { db } from "@/server/db";

/**
 * Проверка связи с БД для /api/health и Docker healthcheck.
 * Единственная функция репозиториев без ctx: не читает и не возвращает данные пользователей
 * (исключение записано в CLAUDE.md → «Железные правила»).
 */
export async function pingDb(): Promise<boolean> {
  try {
    await db.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
