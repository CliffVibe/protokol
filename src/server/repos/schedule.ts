import "server-only";
import { db } from "@/server/db";
import type { StudentCtx } from "./auth";

// Пары студента: только его основная и языковые группы (S1 — группы из ctx, не из URL).

export async function lessonsBetween(ctx: StudentCtx, from: Date, to: Date) {
  return db.lesson.findMany({
    where: {
      startsAt: { gte: from, lt: to },
      OR: [{ groupId: { in: ctx.groupIds } }, { languageGroupId: { in: ctx.languageGroupIds } }],
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      kind: true,
      startsAt: true,
      endsAt: true,
      building: true,
      room: true,
      change: true,
      changeNote: true,
      originalStartsAt: true,
      discipline: { select: { name: true } },
      teacher: { select: { fullName: true } },
      languageGroup: { select: { name: true } },
    },
  });
}

export type LessonRow = Awaited<ReturnType<typeof lessonsBetween>>[number];
