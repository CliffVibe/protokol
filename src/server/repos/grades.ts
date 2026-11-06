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

/**
 * Все семестры одной дисциплины — только у текущего студента (S1): WHERE studentId = ctx.studentId.
 * Чужая дисциплина или чужой id → пустой массив → страница отдаёт 404 (не подтверждаем существование).
 * Общая дисциплина (английский у Алисы и Тимура) — каждому только его строки.
 */
export async function disciplineGradesOf(ctx: StudentCtx, disciplineId: string) {
  return db.grade.findMany({
    where: { studentId: ctx.studentId, disciplineId },
    orderBy: [{ semester: "desc" }],
    select: {
      semester: true,
      kind: true,
      ratingPoints: true,
      finalMark: true,
      passed: true,
      examDate: true,
      discipline: { select: { id: true, name: true, credits: true } },
      teacher: { select: { fullName: true } },
    },
  });
}

export type DisciplineGrade = Awaited<ReturnType<typeof disciplineGradesOf>>[number];

/** Текущий семестр студента — самый поздний, в котором у него есть оценки (null — оценок нет). */
export async function currentSemesterOf(ctx: StudentCtx): Promise<number | null> {
  const { _max } = await db.grade.aggregate({
    where: { studentId: ctx.studentId },
    _max: { semester: true },
  });
  return _max.semester;
}
