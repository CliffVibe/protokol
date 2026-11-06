// Строка дисциплины (роль DisciplineCard из 04-design): строки под линиями, без карточек — как лента
// «Сейчас» и расписание. Касание по всей строке ведёт в детали; светофор — тон + иконка + текст.
import Link from "next/link";
import type { Route } from "next";
import { formatDayMonth, formatTime, plural } from "@/lib/dates";
import { StatusChip } from "@/components/status-chip";
import { pointsToThreshold, type GradeRow } from "@/server/services/academics";
import { ASSESSMENT_KIND, gradeChip } from "./labels";
import { RatingBar } from "./rating-bar";

export const disciplineHref = (id: string) => `/grades/${id}` as Route;

/** «Не хватает 6 баллов до 60». */
export function missingText(points: number): string {
  return `Не хватает ${points} ${plural(points, ["балла", "баллов", "баллов"])} до 60`;
}

export function DisciplineRow({ grade, isCurrent }: { grade: GradeRow; isCurrent: boolean }) {
  const chip = gradeChip(grade, isCurrent);
  const missing = isCurrent ? pointsToThreshold(grade.ratingPoints) : 0;
  const when = grade.examDate
    ? `${formatDayMonth(grade.examDate)}, ${formatTime(grade.examDate)}`
    : null;
  return (
    <li className="relative flex flex-col gap-2 py-4">
      <Link
        href={disciplineHref(grade.discipline.id)}
        className="self-start text-base font-bold text-ink outline-none after:absolute after:inset-0 after:rounded-sm focus-visible:after:ring-2 focus-visible:after:ring-brand hover:underline"
      >
        {grade.discipline.name}
      </Link>
      <p className="text-sm text-ink-muted">
        {ASSESSMENT_KIND[grade.kind]}
        {when ? `, ${when}` : ""}
      </p>
      <div className="flex items-center gap-3">
        <RatingBar value={grade.ratingPoints} tone={chip.tone} className="flex-1" />
        <p className="shrink-0 text-sm text-ink-muted tabular">
          {grade.ratingPoints !== null ? (
            <>
              <span className="font-heading text-lg font-bold text-ink">{grade.ratingPoints}</span>
              /100
            </>
          ) : (
            "—"
          )}
          <span className="sr-only"> — рейтинг</span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusChip tone={chip.tone} icon={chip.icon}>
          {chip.label}
        </StatusChip>
        {missing > 0 ? <span className="text-sm text-ink">{missingText(missing)}</span> : null}
      </div>
    </li>
  );
}
