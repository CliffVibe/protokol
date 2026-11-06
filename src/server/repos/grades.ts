import "server-only";
import { db } from "@/server/db";
import type { StudentCtx } from "./auth";

// Оценки студента — WHERE studentId = ctx.studentId (S1).

export async function gradesOf(ctx: StudentCtx) {
  return db.grade.findMany({
    where: { studentId: ctx.studentId },
    orderBy: [{ semester: "asc" }],
    select: {
      semester: true,
      kind: true,
      ratingPoints: true,
      finalMark: true,
      passed: true,
      examDate: true,
      discipline: { select: { id: true, name: true } },
    },
  });
}
