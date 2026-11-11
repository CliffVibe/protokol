import "server-only";
import { db } from "@/server/db";
import type { StudentCtx } from "./auth";

// «Вам положено» (T14): что студент уже подал и от чего отказался — только свои записи (ctx.studentId).

/** Типы заявок из списка, по которым у студента уже есть живая заявка (не отменена и не отклонена). */
export async function takenTypeCodes(ctx: StudentCtx, typeCodes: string[]): Promise<Set<string>> {
  const rows = await db.request.findMany({
    where: {
      studentId: ctx.studentId,
      status: { notIn: ["CANCELLED", "REJECTED"] },
      type: { code: { in: typeCodes } },
    },
    select: { type: { select: { code: true } } },
  });
  return new Set(rows.map((r) => r.type.code));
}

/** Предложения, на которые студент нажал «Не сейчас» в этом семестре. */
export async function dismissedOffers(ctx: StudentCtx, semester: number): Promise<Set<string>> {
  const rows = await db.offerDismissal.findMany({
    where: { studentId: ctx.studentId, semester },
    select: { code: true },
  });
  return new Set(rows.map((r) => r.code));
}

/** «Не сейчас»: повтор безвреден (уникальность студент + код + семестр). */
export async function dismissOffer(ctx: StudentCtx, code: string, semester: number): Promise<void> {
  await db.offerDismissal.createMany({
    data: [{ studentId: ctx.studentId, code, semester }],
    skipDuplicates: true,
  });
}
