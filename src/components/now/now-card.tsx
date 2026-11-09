import Link from "next/link";
import { CircleAlert, MapPin, UserRound } from "lucide-react";
import { formatCountdown, formatRelativeDay, formatTime, formatWas } from "@/lib/dates";
import type { NextLesson } from "@/server/services/now";
import { Countdown } from "./countdown";
import { LESSON_KIND } from "./labels";
import { StampRings } from "@/components/stamp-rings";
import { dayHref } from "@/components/schedule/nav";

// Ближайшая пара — единственная заливная плашка экрана (Б′, 10.11): ультрамарин, время крупно Unbounded,
// «через N мин» — мятой («хорошо и вовремя»). Кольца-оттиск в углу — тихий намёк на печать бланка.
// Перенос и замена — строкой с иконкой и словом «Перенос» в светлой рамке: жёлтый текст на ультрамарине
// в тёмной теме не набирает 4.5:1, поэтому смысл несут иконка и текст, а не цвет.
// Фокус на плашке — белой обводкой: ультрамариновая (--ring) на ультрамарине не видна.
// T13 (ревью Б′, решение человека 10.11): «Следующая пара» — подписью, не пилюлей (единственный акцент
// плашки — мятный отсчёт); вся плашка — ссылка на день этой пары (касание по всей площади, ::after поверх
// содержимого), без отдельной кнопки «Всё расписание»: на 360 освобождает ~60px, и перенос из «Изменений»
// поднимается на первый экран. Других интерактивных элементов в плашке нет — перекрывать нечего.
export function NowCard({ next, now }: { next: NextLesson; now: Date }) {
  const { lesson, state } = next;
  const day = formatRelativeDay(lesson.startsAt, now);
  const moved = lesson.change === "MOVED" && lesson.originalStartsAt;
  const changedPlace = lesson.change === "ROOM_CHANGED" || lesson.change === "TEACHER_CHANGED";
  const heading =
    state === "ongoing"
      ? "Идёт сейчас"
      : day === "сегодня"
        ? "Следующая пара"
        : `Ближайшая пара — ${day}`;

  return (
    <article
      aria-labelledby="now-card-title"
      className="relative flex flex-col gap-3 overflow-hidden rounded-[1.75rem] bg-plate p-5 text-on-plate md:p-6"
    >
      <StampRings className="text-on-plate" />
      {/* Ссылка — отдельный слой поверх всей плашки (z-10): у блоков внутри свой relative (над кольцами),
          и растянутый ::after привязался бы к ним, а не к плашке. Имя — пара + куда ведёт */}
      <Link
        href={dayHref(lesson.startsAt, now)}
        aria-label={`${lesson.discipline.name}, ${formatTime(lesson.startsAt)}. Открыть в расписании`}
        className="absolute inset-0 z-10 rounded-[1.75rem] outline-none focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-on-plate focus-visible:outline-solid"
      />
      <div className="relative flex flex-wrap items-center gap-2">
        <h2
          id="now-card-title"
          className="font-sans text-sm font-semibold tracking-normal text-plate-muted"
        >
          {heading}
        </h2>
        <p className="rounded-full bg-mint px-3 py-1 text-sm font-semibold text-on-mint tabular">
          <Countdown
            startsAt={lesson.startsAt.toISOString()}
            endsAt={lesson.endsAt.toISOString()}
            initial={formatCountdown(lesson.startsAt, lesson.endsAt, now)}
          />
        </p>
      </div>
      <p className="relative mt-2 flex flex-wrap items-baseline gap-x-1 font-heading tabular">
        {/* min(52px в rem, 18vw): при тексте 200% время растёт, но не шире плашки на 360 (иначе обрезалось) */}
        <span className="text-[length:min(var(--text-4xl),18vw)] leading-none font-semibold tracking-tight">
          {formatTime(lesson.startsAt)}
        </span>
        <span className="text-xl font-semibold text-plate-muted">–{formatTime(lesson.endsAt)}</span>
      </p>
      <div className="relative flex flex-col gap-0.5">
        <p className="text-xl font-semibold break-words">{lesson.discipline.name}</p>
        <p className="text-sm text-plate-muted">
          {LESSON_KIND[lesson.kind]}
          {lesson.languageGroup ? `, ${lesson.languageGroup.name}` : null}
        </p>
      </div>
      <ul className="relative flex flex-col gap-1.5 text-base">
        <li className="flex items-start gap-2">
          <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-plate-muted" />
          <span className="min-w-0">
            <span className="sr-only">Где: </span>
            ауд.&nbsp;{lesson.room}, {lesson.building}
          </span>
        </li>
        <li className="flex items-start gap-2">
          <UserRound aria-hidden className="mt-0.5 size-5 shrink-0 text-plate-muted" />
          <span className="min-w-0">
            <span className="sr-only">Кто ведёт: </span>
            {lesson.teacher.fullName}
          </span>
        </li>
      </ul>
      {moved || changedPlace ? (
        <p className="relative flex items-start gap-2 rounded-xl border border-on-plate/40 px-3 py-2 text-sm font-semibold">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0">
            {moved
              ? `Перенос: ${formatWas(lesson.originalStartsAt!, lesson.startsAt, now)}`
              : lesson.change === "ROOM_CHANGED"
                ? "Другая аудитория"
                : "Замена преподавателя"}
            {lesson.changeNote ? `. ${lesson.changeNote}` : null}
          </span>
        </p>
      ) : null}
    </article>
  );
}
