import "server-only";
import { db } from "@/server/db";
import type { StaffCtx, StudentCtx } from "./auth";

// Лимит вызовов GigaChat (S8, T12): 20 в час на пользователя — и студента, и сотрудника («Черновик ответа»).
// Пользователь — только ctx.userId из сессии. Храним одно время вызова: ни вопроса, ни ответа.

export const AI_CALLS_PER_HOUR = 20;
const HOUR_MS = 60 * 60 * 1000;

export type AiCallSlot = { ok: true } | { ok: false; retryAt: Date };

/**
 * Занять вызов ИИ. Транзакционная блокировка по пользователю (pg_advisory_xact_lock) выстраивает
 * параллельные запросы одного человека в очередь: 25 одновременных → ровно 20 «да» (без неё все прочли бы
 * «19» и прошли). Старые записи этого пользователя удаляются здесь же — таблица не растёт.
 * Отказ сообщает, когда освободится место: самый старый вызов в окне + 1 час.
 */
export async function reserveAiCall(
  ctx: Pick<StudentCtx | StaffCtx, "userId">,
  now: Date = new Date(),
): Promise<AiCallSlot> {
  const since = new Date(now.getTime() - HOUR_MS);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"assistant:" + ctx.userId}))`;
    await tx.assistantUsage.deleteMany({ where: { userId: ctx.userId, createdAt: { lt: since } } });
    const recent = await tx.assistantUsage.findMany({
      where: { userId: ctx.userId, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
      take: AI_CALLS_PER_HOUR,
    });
    if (recent.length >= AI_CALLS_PER_HOUR) {
      const oldest = recent[0]?.createdAt ?? now;
      return { ok: false, retryAt: new Date(oldest.getTime() + HOUR_MS) };
    }
    await tx.assistantUsage.create({
      data: { userId: ctx.userId, createdAt: now },
      select: { id: true },
    });
    return { ok: true };
  });
}
