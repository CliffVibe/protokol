import "server-only";
import type { StudentCtx } from "@/server/auth/guards";
import { currentSemesterOf, disciplineGradesOf, gradesOf } from "@/server/repos/grades";
import { isDebt, semestersOf, summarizeStudy, type GradeRow, type StudySummary } from "./academics";

// Успеваемость (T07): данные только через repos/grades (WHERE studentId = ctx.studentId, S1).
// Расчёты — чистые функции в academics.ts.

export type GradesOverview = {
  grades: GradeRow[];
  /** null — оценок нет вовсе (первокурсник до сессии) */
  summary: StudySummary | null;
  /** Семестры, новые первыми */
  semesters: number[];
  /** Долги прошлых семестров — видны всегда, не прячутся за переключателем */
  debts: GradeRow[];
};

export async function getGradesOverview(ctx: StudentCtx): Promise<GradesOverview> {
  const grades = await gradesOf(ctx);
  const summary = summarizeStudy(grades);
  return {
    grades,
    summary,
    semesters: semestersOf(grades),
    debts: summary ? grades.filter((g) => g.semester < summary.semester && isDebt(g)) : [],
  };
}

/**
 * Дисциплина по семестрам (новые первыми) и текущий семестр студента — или null: дисциплины у студента
 * нет → 404. Текущий семестр — по всем оценкам, а не по этой дисциплине (долг 6-го семестра — не «текущий»).
 */
export async function getDisciplineDetails(ctx: StudentCtx, disciplineId: string) {
  const [rows, currentSemester] = await Promise.all([
    disciplineGradesOf(ctx, disciplineId),
    currentSemesterOf(ctx),
  ]);
  return rows.length ? { rows, currentSemester } : null;
}
