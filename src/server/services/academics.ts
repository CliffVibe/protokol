// Успеваемость: средний рейтинг, долги, стипендия. Чистые функции — без БД (их же использует T07).
//
// ПРАВИЛО СТИПЕНДИИ ВЫМЫШЛЕННОЕ (концепт, не правила вуза; записано и в docs/01-concept.md):
// стипендия сохраняется, если
//   1) нет долгов ни в одном прошлом семестре (оценка 2 или «не зачтено»),
//   2) в прошлой сессии нет оценок ниже 4,
//   3) в текущем семестре рейтинг по каждой дисциплине не ниже 60 из 100.
// Иначе — «под угрозой» с причинами. Нет ни одной оценки (первокурсник до сессии) — статуса нет.
import type { AssessmentKind } from "@/generated/prisma/client";

export const SCHOLARSHIP_MIN_RATING = 60;
export const SCHOLARSHIP_MIN_MARK = 4;

export type GradeRow = {
  semester: number;
  kind: AssessmentKind;
  ratingPoints: number | null;
  finalMark: number | null;
  passed: boolean | null;
  examDate: Date | null;
  discipline: { id: string; name: string };
};

export type Scholarship = { kept: true } | { kept: false; reasons: string[] };

export type StudySummary = {
  semester: number;
  averageRating: number | null;
  debts: number;
  scholarship: Scholarship;
};

export function currentSemester(grades: GradeRow[]): number | null {
  return grades.length ? Math.max(...grades.map((g) => g.semester)) : null;
}

const isDebt = (g: GradeRow) => g.finalMark === 2 || g.passed === false;

export function averageRating(rows: GradeRow[]): number | null {
  const points = rows.map((g) => g.ratingPoints).filter((p): p is number => p !== null);
  if (!points.length) return null;
  return Math.round(points.reduce((a, b) => a + b, 0) / points.length);
}

export function summarizeStudy(grades: GradeRow[]): StudySummary | null {
  const semester = currentSemester(grades);
  if (semester === null) return null;
  const current = grades.filter((g) => g.semester === semester);
  const past = grades.filter((g) => g.semester < semester);
  const lastSession = past.filter((g) => g.semester === semester - 1);

  const reasons: string[] = [];
  const debts = past.filter(isDebt);
  for (const g of debts) reasons.push(`Долг: ${g.discipline.name}`);
  for (const g of lastSession) {
    if (g.finalMark !== null && g.finalMark > 2 && g.finalMark < SCHOLARSHIP_MIN_MARK) {
      reasons.push(`Оценка ${g.finalMark} в прошлой сессии: ${g.discipline.name}`);
    }
  }
  for (const g of current) {
    if (g.ratingPoints !== null && g.ratingPoints < SCHOLARSHIP_MIN_RATING) {
      reasons.push(`${g.discipline.name}: ${g.ratingPoints}/100`);
    }
  }

  return {
    semester,
    averageRating: averageRating(current),
    debts: debts.length,
    scholarship: reasons.length ? { kept: false, reasons } : { kept: true },
  };
}
