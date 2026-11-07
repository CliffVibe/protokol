// Правило стипендии — ОДНО на сервер («Как у меня дела», «Сейчас») и клиент («Что если…», T11).
// Чистые функции без БД: их импортирует и services/academics.ts, и клиентский симулятор, поэтому
// здесь нет ни server-only, ни запросов — только расчёт.
//
// ПРАВИЛО ВЫМЫШЛЕННОЕ (концепт, не правила вуза; записано и в docs/01-concept.md):
// стипендия на семестр S сохраняется, если
//   1) нет долгов ни в одном семестре до S (оценка 2 или «не зачтено»),
//   2) в сессии семестра S − 1 нет оценок ниже 4,
//   3) в семестре S рейтинг по каждой дисциплине не ниже 60 из 100.
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

export const isDebt = (g: Pick<GradeRow, "finalMark" | "passed">) =>
  g.finalMark === 2 || g.passed === false;

/** Оценка 3 — сдано, но ниже 4 (снимает стипендию следующего семестра). */
export const isLowMark = (g: Pick<GradeRow, "finalMark">) =>
  g.finalMark !== null && g.finalMark > 2 && g.finalMark < SCHOLARSHIP_MIN_MARK;

type Issue =
  | { kind: "debt"; name: string }
  | { kind: "mark"; name: string; mark: number }
  | { kind: "rating"; name: string; rating: number };

/** Нарушения правила для стипендии на семестр `semester` — по порядку пунктов правила. */
function issuesAsOf(grades: GradeRow[], semester: number): Issue[] {
  const issues: Issue[] = [];
  for (const g of grades) {
    if (g.semester < semester && isDebt(g)) issues.push({ kind: "debt", name: g.discipline.name });
  }
  for (const g of grades) {
    if (g.semester === semester - 1 && isLowMark(g)) {
      issues.push({ kind: "mark", name: g.discipline.name, mark: g.finalMark! });
    }
  }
  for (const g of grades) {
    if (g.semester === semester && g.ratingPoints !== null) {
      if (g.ratingPoints < SCHOLARSHIP_MIN_RATING) {
        issues.push({ kind: "rating", name: g.discipline.name, rating: g.ratingPoints });
      }
    }
  }
  return issues;
}

function issueText(i: Issue, projection: boolean): string {
  switch (i.kind) {
    case "debt":
      return `Долг: ${i.name}`;
    case "mark":
      return projection
        ? `Оценка ${i.mark}: ${i.name}`
        : `Оценка ${i.mark} в прошлой сессии: ${i.name}`;
    case "rating":
      return `${i.name}: ${i.rating} из 100, нужно ${SCHOLARSHIP_MIN_RATING}`;
  }
}

function toScholarship(issues: Issue[], projection: boolean): Scholarship {
  return issues.length
    ? { kept: false, reasons: issues.map((i) => issueText(i, projection)) }
    : { kept: true };
}

/** Стипендия на семестр `semester` по уже известным оценкам. */
export function scholarshipAsOf(grades: GradeRow[], semester: number): Scholarship {
  return toScholarship(issuesAsOf(grades, semester), false);
}

// ── «Что если…» (T11): прогноз на следующий семестр по итогам текущей сессии ──

/** Предполагаемый итог: оценка (экзамен, дифзачёт, курсовая) или зачёт/незачёт. */
export type SessionPick = { mark: 2 | 3 | 4 | 5 } | { passed: boolean };

/** Дисциплина без итога — её можно «сдать» в симуляторе. */
export const isPending = (g: Pick<GradeRow, "finalMark" | "passed">) =>
  g.finalMark === null && g.passed === null;

/** Зачёт ставится словом, остальное — оценкой. */
export const picksPassFail = (kind: AssessmentKind) => kind === "CREDIT";

export type SessionProjection = {
  scholarship: Scholarship;
  /** Средний балл сессии по пятибалльным итогам (известные + выбранные), один знак; null — их нет */
  average: number | null;
  /** Дисциплины без итога, для которых ничего не выбрано: считаем сданными на 4 и выше */
  unpicked: number;
};

/**
 * Сессия семестра `semester` сдана так, как выбрал студент; невыбранные дисциплины без итога — не ниже 4
 * (о допущении экран говорит прямо). Ответ — стипендия на следующий семестр по тому же правилу:
 * его рейтингов ещё нет, поэтому пункт 3 не срабатывает.
 */
export function projectSession(
  grades: GradeRow[],
  semester: number,
  picks: Readonly<Record<string, SessionPick>>,
): SessionProjection {
  let unpicked = 0;
  const simulated = grades.map((g) => {
    if (g.semester !== semester || !isPending(g)) return g;
    const pick = picks[g.discipline.id];
    if (!pick) {
      unpicked += 1;
      return g;
    }
    return "mark" in pick ? { ...g, finalMark: pick.mark } : { ...g, passed: pick.passed };
  });
  const marks = simulated
    .filter((g) => g.semester === semester && g.finalMark !== null)
    .map((g) => g.finalMark!);
  return {
    scholarship: toScholarship(issuesAsOf(simulated, semester + 1), true),
    average: marks.length
      ? Math.round((marks.reduce((a, b) => a + b, 0) / marks.length) * 10) / 10
      : null,
    unpicked,
  };
}
