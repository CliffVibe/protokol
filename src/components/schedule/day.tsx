// День расписания: заголовок и пары под тонкими линиями — графы бланка, без карточек (как лента «Сейчас»).
import { Fragment } from "react";
import { CircleCheck, Footprints, GraduationCap, Languages } from "lucide-react";
import { formatLongDay, formatTime } from "@/lib/dates";
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
  showTitle = true,
}: {
  day: ScheduleDay;
  now: Date;
  isToday: boolean;
  headingLevel?: 2 | 3;
  /** В «Дне» дата уже крупно в шапке со стрелками — заголовок остаётся только для скринридера */
  showTitle?: boolean;
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
      <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", !showTitle && "sr-only")}>
        <Heading id={titleId} className="text-xl">
          {title}
        </Heading>
        {isToday && showTitle ? (
          <span className="border-b-2 border-brand text-sm font-bold text-brand">Сегодня</span>
        ) : null}
      </div>
      {day.items.length ? (
        <ul
          aria-label={`Пары: ${title}`}
          className="flex flex-col divide-y divide-line border-y border-line"
        >
          {day.items.map(({ lesson, transition }) => (
            <Fragment key={lesson.id}>
              {transition ? <TransitionRow transition={transition} /> : null}
              <LessonRow lesson={toLessonView(lesson, now)} />
            </Fragment>
          ))}
        </ul>
      ) : (
        <p className="border-t border-line pt-3 pb-1 text-base text-ink-muted">Пар нет</p>
      )}
    </section>
  );
}

export function LessonRow({ lesson }: { lesson: LessonView }) {
  const { change, cancelled, past } = lesson;
  const quiet = cancelled || past;
  return (
    <li
      className={cn(
        "relative flex flex-wrap gap-x-4 gap-y-2 py-3",
        // Полоса изменения — в поле страницы, слева от строки: столбец времени остаётся ровным.
        // Это третий носитель смысла после иконки и текста, не единственный. Размеры в px — не растут при 200%.
        change &&
          "before:absolute before:inset-y-3 before:left-[-10px] before:w-[4px] before:rounded-full",
        change && (cancelled ? "before:bg-danger" : "before:bg-warn"),
      )}
    >
      <p className="flex w-[4.5rem] shrink-0 flex-col tabular">
        <span
          className={cn(
            "font-heading text-lg leading-tight font-bold",
            quiet ? "text-ink-muted" : "text-ink",
            cancelled && "line-through",
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
            quiet ? "text-ink-muted" : "text-ink",
            cancelled && "line-through",
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

        {lesson.language || lesson.ongoing || lesson.exam || (past && !cancelled) || change ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {lesson.ongoing ? <StatusChip tone="brand">Идёт сейчас</StatusChip> : null}
            {past && !cancelled ? <StatusChip icon={CircleCheck}>Прошла</StatusChip> : null}
            {lesson.exam ? (
              <StatusChip tone="brand" icon={GraduationCap}>
                Экзамен
              </StatusChip>
            ) : null}
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

/**
 * Переход между корпусами — своя строка между двумя парами, той же сеткой: слева — когда
 * (перерыв от конца одной пары до начала другой), справа — откуда и куда. Время в дороге не выдумываем.
 * Раньше подсказка стояла внутри следующей пары, и было непонятно, между какими парами переход
 * (человек на проверке с телефона, T06).
 */
function TransitionRow({ transition }: { transition: Transition }) {
  const from = formatTime(transition.startsAt);
  const to = formatTime(transition.endsAt);
  return (
    <li className="flex flex-wrap gap-x-4 gap-y-1 py-2.5 text-sm">
      <p className="sr-only">
        Переход между корпусами с {from} до {to}, перерыв {transition.breakMinutes} мин: из{" "}
        {transition.from} в {transition.to}
      </p>
      {/* Время перерыва — тихим цветом, как конец пары: brand только у заголовка, строка — не ссылка */}
      <p aria-hidden className="flex w-[4.5rem] shrink-0 flex-col text-ink-muted tabular">
        <span>{from}</span>
        <span>{to}</span>
      </p>
      <div aria-hidden className="flex min-w-[min(12rem,100%)] flex-1 flex-col">
        {/* «Перерыв N мин», а не «переход N мин»: это время между парами, не дорога (ux-reviewer) */}
        <span className="flex items-start gap-1.5 font-bold text-brand">
          <Footprints className="mt-0.5 size-4 shrink-0" />
          Перерыв {transition.breakMinutes} мин — переход в другой корпус
        </span>
        <span className="text-ink">
          {transition.from} → {transition.to}
        </span>
      </div>
    </li>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
