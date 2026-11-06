// Успеваемость: средний рейтинг, долги, стипендия. Чистые функции — без БД (их же использует T07).
//
// ПРАВИЛО СТИПЕНДИИ ВЫМЫШЛЕННОЕ (концепт, не правила вуза; записано и в docs/01-concept.md):
// стипендия сохраняется, если
//   1) нет долгов ни в одном прошлом семестре (оценка 2 или «не зачтено»),
//   2) в прошлой сессии нет оценок ниже 4,
//   3) в текущем семестре рейтинг по каждой дисциплине не ниже 60 из 100.
// Иначе — «под угрозой» с причинами. Нет ни одной оценки (первокурсник до сессии) — статуса нет.
import type { AssessmentKind } from "@/generated/prisma/client";
import { mskStartOfDay } from "@/lib/msk";

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

// ── Экран «Успеваемость» (T07). Чистые функции: их же переиспользует «Что если…» (T11). ──
//
// СВЕТОФОР ДИСЦИПЛИНЫ — тоже вымышленный, из того же правила (docs/01-concept.md):
//   debt  — долг: оценка 2 или «не зачтено»;
//   low   — текущий рейтинг ниже 60 из 100 (стипендия под угрозой);
//   mark3 — оценка 3 (в прошлой сессии снимает стипендию);
//   ok    — всё остальное.

export type Attention = "debt" | "low" | "mark3" | "ok";

export const isDebt = (g: Pick<GradeRow, "finalMark" | "passed">) =>
  g.finalMark === 2 || g.passed === false;

export function gradeAttention(g: GradeRow, isCurrent: boolean): Attention {
  if (isDebt(g)) return "debt";
  if (isCurrent && g.ratingPoints !== null && g.ratingPoints < SCHOLARSHIP_MIN_RATING) return "low";
  if (g.finalMark !== null && g.finalMark > 2 && g.finalMark < SCHOLARSHIP_MIN_MARK) return "mark3";
  return "ok";
}

/** Сколько баллов не хватает до 60; 0 — хватает или баллов ещё нет. */
export function pointsToThreshold(rating: number | null): number {
  return rating === null ? 0 : Math.max(0, SCHOLARSHIP_MIN_RATING - rating);
}

const ATTENTION_ORDER: Record<Attention, number> = { debt: 0, low: 1, mark3: 2, ok: 3 };

/** Сначала проблемные (долг → ниже 60 → оценка 3), внутри — по рейтингу по возрастанию; остальные — по алфавиту. */
export function sortForAttention<T extends GradeRow>(rows: T[], isCurrent: boolean): T[] {
  return [...rows].sort((a, b) => {
    const ka = gradeAttention(a, isCurrent);
    const kb = gradeAttention(b, isCurrent);
    if (ka !== kb) return ATTENTION_ORDER[ka] - ATTENTION_ORDER[kb];
    if (ka !== "ok") return (a.ratingPoints ?? 101) - (b.ratingPoints ?? 101);
    return a.discipline.name.localeCompare(b.discipline.name, "ru");
  });
}

/** Семестры студента, новые первыми: [7, 6] — текущий первым. */
export function semestersOf(grades: Pick<GradeRow, "semester">[]): number[] {
  return [...new Set(grades.map((g) => g.semester))].sort((a, b) => b - a);
}

export type SessionSummary = {
  /** Первая и последняя известная дата контроля; null — дат ещё нет (у зачётов их часто нет) */
  from: Date | null;
  to: Date | null;
  counts: Record<AssessmentKind, number>;
  /** Ближайший контроль с датой не раньше сегодняшнего дня (по Москве) */
  next: { name: string; kind: AssessmentKind; at: Date; inDays: number } | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** Номер московских суток — чтобы «через N дней» считалось по календарю, а не по 24 часам */
const mskDayNumber = (d: Date) => Math.round(+mskStartOfDay(d) / DAY_MS);

/** Сессия текущего семестра: даты (только известные — не выдумываем), счёт по типам, ближайший контроль. */
export function sessionSummary(current: GradeRow[], now: Date): SessionSummary | null {
  if (!current.length) return null;
  const counts: Record<AssessmentKind, number> = {
    EXAM: 0,
    CREDIT: 0,
    GRADED_CREDIT: 0,
    COURSEWORK: 0,
  };
  for (const g of current) counts[g.kind] += 1;
  const dated = current
    .filter((g): g is GradeRow & { examDate: Date } => g.examDate !== null)
    .sort((a, b) => +a.examDate - +b.examDate);
  const today = mskDayNumber(now);
  const upcoming = dated.find(
    (g) => mskDayNumber(g.examDate) >= today && g.finalMark === null && g.passed === null,
  );
  return {
    from: dated[0]?.examDate ?? null,
    to: dated.at(-1)?.examDate ?? null,
    counts,
    next: upcoming
      ? {
          name: upcoming.discipline.name,
          kind: upcoming.kind,
          at: upcoming.examDate,
          inDays: mskDayNumber(upcoming.examDate) - today,
        }
      : null,
  };
}
