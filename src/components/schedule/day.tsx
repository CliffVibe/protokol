// День расписания: заголовок и пары под тонкими линиями — графы бланка, без карточек (как лента «Сейчас»).
import { Footprints, Languages } from "lucide-react";
import { formatLongDay } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ScheduleDay, Transition } from "@/server/services/schedule";
import { CHANGE } from "@/components/now/labels";
import { StatusChip } from "@/components/status-chip";
import { LessonOpenButton } from "./lesson-sheet";
import { toLessonView, type LessonView } from "./lesson-view";

export function DaySection({
  day,
  now,
  isToday,
  headingLevel = 2,
}: {
  day: ScheduleDay;
  now: Date;
  isToday: boolean;
  headingLevel?: 2 | 3;
}) {
  const Heading = `h${headingLevel}` as const;
  const title = formatLongDay(day.start);
  const titleId = `day-${day.key}-title`;
  return (
    <section
      id={`day-${day.key}`}
      aria-labelledby={titleId}
      className="flex scroll-mt-4 flex-col gap-2"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Heading id={titleId} className="text-xl">
          {title}
        </Heading>
        {isToday ? (
          <span className="border-b-2 border-brand text-sm font-bold text-brand">Сегодня</span>
        ) : null}
      </div>
      {day.items.length ? (
        <ul
          aria-label={`Пары: ${title}`}
          className="flex flex-col divide-y divide-line border-y border-line"
        >
          {day.items.map(({ lesson, transition }) => (
            <LessonRow key={lesson.id} lesson={toLessonView(lesson, now)} transition={transition} />
          ))}
        </ul>
      ) : (
        <p className="border-t border-line pt-3 pb-1 text-base text-ink-muted">Пар нет</p>
      )}
    </section>
  );
}

export function LessonRow({
  lesson,
  transition,
}: {
  lesson: LessonView;
  transition: Transition | null;
}) {
  const { change, cancelled } = lesson;
  return (
    <li
      className={cn(
        "relative flex flex-wrap gap-x-4 gap-y-2 py-3",
        // Полоса слева — третий носитель изменения после иконки и текста, не единственный
        change && "border-l-4 pl-3",
        change && (cancelled ? "border-l-danger" : "border-l-warn"),
      )}
    >
      {transition ? <TransitionHint transition={transition} /> : null}

      <p className="flex w-[4.5rem] shrink-0 flex-col tabular">
        <span
          className={cn(
            "font-heading text-lg leading-tight font-bold",
            cancelled ? "text-ink-muted line-through" : "text-ink",
          )}
        >
          {lesson.start}
        </span>
        <span className={cn("text-sm text-ink-muted", cancelled && "line-through")}>
          {lesson.end}
        </span>
      </p>

      {/* min-w: при тексте 200% колонка не сжимается, а уходит под время */}
      <div className="flex min-w-[min(12rem,100%)] flex-1 flex-col gap-1">
        <LessonOpenButton
          lesson={lesson}
          className={cn(
            "self-start text-base font-bold",
            cancelled ? "text-ink-muted line-through" : "text-ink",
          )}
        >
          {lesson.title}
          <span className="sr-only">
            , {lesson.start}. Подробнее{cancelled ? " — пара отменена" : ""}
          </span>
        </LessonOpenButton>
        <p className="text-sm text-ink-muted">
          {lesson.kind}, ауд. {lesson.room}, {lesson.building}
        </p>
        <p className="text-sm text-ink-muted">{lesson.teacher}</p>

        {lesson.language || lesson.ongoing || change ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {lesson.ongoing ? <StatusChip tone="brand">Идёт сейчас</StatusChip> : null}
            {change ? (
              <StatusChip tone={change.tone} icon={CHANGE[change.kind].icon}>
                {change.label}
              </StatusChip>
            ) : null}
            {lesson.language ? (
              <StatusChip icon={Languages}>
                <span className="sr-only">Языковая группа: </span>
                {lesson.language}
              </StatusChip>
            ) : null}
          </div>
        ) : null}
        {change && (change.was || change.note) ? (
          <p className="text-sm text-ink">
            {change.was ? <span className="font-bold">{capitalize(change.was)}. </span> : null}
            {change.note}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function TransitionHint({ transition }: { transition: Transition }) {
  // Новый корпус уже написан в строке пары — здесь только «что делать» и сколько на это времени
  return (
    <p className="flex basis-full items-start gap-2 text-sm font-bold text-brand">
      <Footprints aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>
        Переход между корпусами: перерыв {transition.breakMinutes} мин
        <span className="sr-only">, из корпуса «{transition.from}»</span>
      </span>
    </p>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
