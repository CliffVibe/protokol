import Link from "next/link";
import { CircleAlert, MapPin, UserRound } from "lucide-react";
import { formatCountdown, formatRelativeDay, formatTime, formatWas } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { NextLesson } from "@/server/services/now";
import { Countdown } from "./countdown";
import { LESSON_KIND } from "./labels";

// Ближайшая пара — единственная «карточка» и главный акцент экрана: время крупно, остальное тихо.
// Перенос — полоса --warn слева + иконка + «было 09:30» (не только цвет).
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
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 md:p-5",
        (moved || changedPlace) && "border-l-4 border-l-warn",
      )}
    >
      <h2 id="now-card-title" className="text-sm font-bold text-ink-muted">
        {heading}
      </h2>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="font-heading text-3xl font-bold text-ink tabular">
          {formatTime(lesson.startsAt)}
          <span className="text-xl text-ink-muted">–{formatTime(lesson.endsAt)}</span>
        </p>
        <p className="text-base font-bold text-brand">
          <Countdown
            startsAt={lesson.startsAt.toISOString()}
            endsAt={lesson.endsAt.toISOString()}
            initial={formatCountdown(lesson.startsAt, lesson.endsAt, now)}
          />
        </p>
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="font-heading text-xl font-bold break-words text-ink">
          {lesson.discipline.name}
        </p>
        <p className="text-sm text-ink-muted">
          {LESSON_KIND[lesson.kind]}
          {lesson.languageGroup ? `, ${lesson.languageGroup.name}` : null}
        </p>
      </div>
      <ul className="flex flex-col gap-1.5 text-base text-ink">
        <li className="flex items-start gap-2">
          <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
          <span>
            <span className="sr-only">Где: </span>
            ауд. {lesson.room}, {lesson.building}
          </span>
        </li>
        <li className="flex items-start gap-2">
          <UserRound aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
          <span>
            <span className="sr-only">Кто ведёт: </span>
            {lesson.teacher.fullName}
          </span>
        </li>
      </ul>
      {moved || changedPlace ? (
        <p className="flex items-start gap-2 text-sm font-bold text-warn">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            {moved
              ? `Перенос: ${formatWas(lesson.originalStartsAt!, lesson.startsAt, now)}`
              : lesson.change === "ROOM_CHANGED"
                ? "Другая аудитория"
                : "Замена преподавателя"}
            {lesson.changeNote ? `. ${lesson.changeNote}` : null}
          </span>
        </p>
      ) : null}
      {/* Главный блок тоже ведёт в раздел — за 1 касание (ux-reviewer, T05) */}
      <Link
        href="/schedule"
        className="inline-flex min-h-11 items-center self-start text-sm font-bold text-brand underline-offset-4 hover:underline"
      >
        Всё расписание
      </Link>
    </article>
  );
}
