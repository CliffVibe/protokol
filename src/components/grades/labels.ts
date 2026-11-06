// Подписи «Успеваемости» (T07): тип контроля, оценка словом, светофор дисциплины.
// Светофор — тон + своя иконка + текст: цвет никогда не единственный носитель смысла.
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleX,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
import type { AssessmentKind } from "@/generated/prisma/client";
import type { StatusTone } from "@/components/status-chip";
import { gradeAttention, type GradeRow } from "@/server/services/academics";

export const ASSESSMENT_KIND: Record<AssessmentKind, string> = {
  EXAM: "Экзамен",
  CREDIT: "Зачёт",
  GRADED_CREDIT: "Дифференцированный зачёт",
  COURSEWORK: "Курсовая работа",
};

/** Для сводки сессии: «2 экзамена, 1 зачёт». */
export const ASSESSMENT_PLURAL: Record<AssessmentKind, [string, string, string]> = {
  EXAM: ["экзамен", "экзамена", "экзаменов"],
  CREDIT: ["зачёт", "зачёта", "зачётов"],
  GRADED_CREDIT: [
    "дифференцированный зачёт",
    "дифференцированных зачёта",
    "дифференцированных зачётов",
  ],
  COURSEWORK: ["курсовая работа", "курсовые работы", "курсовых работ"],
};

const MARK_WORD: Record<number, string> = {
  5: "Отлично",
  4: "Хорошо",
  3: "Удовлетворительно",
  2: "Неудовлетворительно",
};

/** «Отлично (5)», «Зачтено», «Не зачтено» или null — итога ещё нет. */
export function resultLabel(g: Pick<GradeRow, "finalMark" | "passed">): string | null {
  if (g.finalMark !== null) return `${MARK_WORD[g.finalMark] ?? "Оценка"} (${g.finalMark})`;
  if (g.passed === true) return "Зачтено";
  if (g.passed === false) return "Не зачтено";
  return null;
}

export type GradeChip = { label: string; tone: StatusTone; icon: LucideIcon };

/** Чип светофора для строки дисциплины. */
export function gradeChip(g: GradeRow, isCurrent: boolean): GradeChip {
  switch (gradeAttention(g, isCurrent)) {
    case "debt":
      return { label: "Долг", tone: "danger", icon: CircleX };
    case "low":
      return { label: "Ниже 60", tone: "warn", icon: TrendingDown };
    case "mark3":
      return { label: resultLabel(g) ?? "Оценка 3", tone: "warn", icon: CircleAlert };
    case "ok": {
      const result = resultLabel(g);
      if (result) return { label: result, tone: "ok", icon: CircleCheck };
      if (g.ratingPoints === null)
        return { label: "Баллов пока нет", tone: "neutral", icon: CircleDashed };
      return { label: "В норме", tone: "ok", icon: CircleCheck };
    }
  }
}
