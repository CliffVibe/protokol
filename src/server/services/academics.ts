// Успеваемость: средний рейтинг, долги, стипендия. Чистые функции — без БД (их же использует T07).
//
// Само правило стипендии — в src/lib/scholarship.ts: тот же код считает «Что если…» на клиенте (T11),
// поэтому оно не дублируется. Здесь — сводка и экран «Успеваемость».
import type { AssessmentKind } from "@/generated/prisma/client";
import {
  SCHOLARSHIP_MIN_MARK,
  SCHOLARSHIP_MIN_RATING,
  isDebt,
  isLowMark,
  scholarshipAsOf,
  type GradeRow,
  type Scholarship,
} from "@/lib/scholarship";
import { mskStartOfDay } from "@/lib/msk";

export { SCHOLARSHIP_MIN_MARK, SCHOLARSHIP_MIN_RATING, isDebt };
export type { GradeRow, Scholarship };

export type StudySummary = {
  semester: number;
  averageRating: number | null;
  debts: number;
  scholarship: Scholarship;
  /** Сколько последних закрытых сессий подряд — только «отлично» и «зачтено» (правило «Деканат предлагает») */
  excellentSessions: number;
  /** Самый старый долг и дата пересдачи, если назначена (правило «Деканат предлагает» → заявление на пересдачу) */
  firstDebt: { discipline: string; retakeAt: Date | null } | null;
};

/** Сессия на «отлично»: есть хотя бы одна оценка, все оценки — 5, все зачёты — «зачтено». */
function isExcellentSession(rows: GradeRow[]): boolean {
  const marks = rows.filter((g) => g.finalMark !== null);
  return (
    marks.length > 0 &&
    marks.every((g) => g.finalMark === 5) &&
    rows.every((g) => g.passed !== false && (g.finalMark !== null || g.passed !== null))
  );
}

/** Подряд закрытые сессии на «отлично», считая от прошлой (текущая ещё не сдана). */
export function excellentSessionsBefore(grades: GradeRow[], semester: number): number {
  let n = 0;
  for (let s = semester - 1; s >= 1; s--) {
    const rows = grades.filter((g) => g.semester === s);
    if (!rows.length || !isExcellentSession(rows)) break;
    n += 1;
  }
  return n;
}

export function currentSemester(grades: GradeRow[]): number | null {
  return grades.length ? Math.max(...grades.map((g) => g.semester)) : null;
}

export function averageRating(rows: GradeRow[]): number | null {
  const points = rows.map((g) => g.ratingPoints).filter((p): p is number => p !== null);
  if (!points.length) return null;
  return Math.round(points.reduce((a, b) => a + b, 0) / points.length);
}

export function summarizeStudy(grades: GradeRow[], now = new Date()): StudySummary | null {
  const semester = currentSemester(grades);
  if (semester === null) return null;
  const debts = grades
    .filter((g) => g.semester < semester && isDebt(g))
    .sort((a, b) => a.semester - b.semester);
  const first = debts[0];
  return {
    semester,
    averageRating: averageRating(grades.filter((g) => g.semester === semester)),
    debts: debts.length,
    scholarship: scholarshipAsOf(grades, semester),
    excellentSessions: excellentSessionsBefore(grades, semester),
    // Будущая дата у оценки с долгом — это пересдача (как в now.ts); прошедшая — не назначена заново
    firstDebt: first
      ? {
          discipline: first.discipline.name,
          retakeAt: first.examDate && first.examDate > now ? first.examDate : null,
        }
      : null,
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

export function gradeAttention(g: GradeRow, isCurrent: boolean): Attention {
  if (isDebt(g)) return "debt";
  if (isCurrent && g.ratingPoints !== null && g.ratingPoints < SCHOLARSHIP_MIN_RATING) return "low";
  if (isLowMark(g)) return "mark3";
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
