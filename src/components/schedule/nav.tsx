// Навигация расписания: «Сегодня / Неделя», переход по неделям, полоса дней, изменения недели.
// Всё — обычные ссылки: работает без JS, с клавиатуры, и адрес недели можно переслать.
import Link from "next/link";
import type { Route } from "next";
import { ChevronLeft, ChevronRight, CircleAlert } from "lucide-react";
import { formatDayShort, formatRelativeDay, formatTime, formatWeekRange } from "@/lib/dates";
import { addDays, formatIsoWeek, mskDateKey } from "@/lib/msk";
import { cn } from "@/lib/utils";
import type { LessonRow } from "@/server/repos/schedule";
import type { ScheduleDay } from "@/server/services/schedule";
import { CHANGE } from "@/components/now/labels";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";

export const weekHref = (d: Date, hash?: string) =>
  `/schedule?week=${formatIsoWeek(d)}${hash ? `#${hash}` : ""}` as Route;

export function ScheduleToggle({ view, now }: { view: "today" | "week"; now: Date }) {
  const items = [
    { key: "today", label: "Сегодня", href: "/schedule" as Route },
    { key: "week", label: "Неделя", href: weekHref(now) },
  ] as const;
  return (
    <nav aria-label="Вид расписания">
      <ul className="flex gap-6 border-b border-line">
        {items.map((i) => {
          const active = i.key === view;
          return (
            <li key={i.key}>
              <Link
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  // Активный — чернильная черта и полужирный, как в навигации (04-design), не плашка
                  "-mb-px inline-flex min-h-11 items-center border-b-2 text-base",
                  active
                    ? "border-brand font-bold text-ink"
                    : "border-transparent text-ink-muted hover:text-ink",
                )}
              >
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function relativeWeek(offset: number): string | null {
  if (offset === 0) return "Эта неделя";
  if (offset === 1) return "Следующая неделя";
  if (offset === -1) return "Прошлая неделя";
  return null;
}

export function WeekNav({
  weekStart,
  currentWeekStart,
}: {
  weekStart: Date;
  currentWeekStart: Date;
}) {
  const offset = Math.round((+weekStart - +currentWeekStart) / (7 * 24 * 3600 * 1000));
  const prev = addDays(weekStart, -7);
  const next = addDays(weekStart, 7);
  const relative = relativeWeek(offset);
  return (
    <nav aria-label="Недели" className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        {/* Размер цели — в px: при тексте 200% стрелки не растут и не наезжают на даты (урок T04) */}
        <Button asChild variant="outline" size="icon" className="size-[44px]">
          <Link href={weekHref(prev)} aria-label={`Предыдущая неделя, ${formatWeekRange(prev)}`}>
            <ChevronLeft aria-hidden className="size-5" />
          </Link>
        </Button>
        <div className="flex min-w-0 flex-1 flex-col items-center text-center break-words">
          <p className="font-heading text-xl font-bold text-ink tabular">
            {formatWeekRange(weekStart)}
          </p>
          {relative ? <p className="text-sm text-ink-muted">{relative}</p> : null}
        </div>
        <Button asChild variant="outline" size="icon" className="size-[44px]">
          <Link href={weekHref(next)} aria-label={`Следующая неделя, ${formatWeekRange(next)}`}>
            <ChevronRight aria-hidden className="size-5" />
          </Link>
        </Button>
      </div>
      {offset !== 0 ? (
        <Link
          href={weekHref(currentWeekStart)}
          className="inline-flex min-h-11 items-center self-center text-sm font-bold text-brand underline-offset-4 hover:underline"
        >
          К текущей неделе
        </Link>
      ) : null}
    </nav>
  );
}

/** Пн…сб якорями: на телефоне до четверга — одно касание, а не прокрутка всей недели. */
export function DayStrip({ days, todayKey }: { days: ScheduleDay[]; todayKey: string }) {
  return (
    <nav aria-label="Дни недели" className="lg:max-w-xl">
      <ul className="flex flex-wrap">
        {days.map((d) => {
          const { weekday, day } = formatDayShort(d.start);
          const isToday = d.key === todayKey;
          const changed = d.items.some((i) => i.lesson.change !== "NONE");
          return (
            <li key={d.key} className="min-w-[44px] flex-1">
              <a
                href={`#day-${d.key}`}
                aria-current={isToday ? "date" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center rounded-lg border-b-2 px-1 py-1 text-center hover:bg-muted",
                  isToday ? "border-brand font-bold text-ink" : "border-transparent text-ink-muted",
                )}
              >
                <span className="text-sm">{weekday}</span>
                <span className="flex items-center gap-0.5 text-base text-ink tabular">
                  {day}
                  {changed ? <CircleAlert aria-hidden className="size-3.5 text-warn" /> : null}
                </span>
                <span className="sr-only">
                  {isToday ? ", сегодня" : ""}
                  {changed ? ", есть изменения" : ""}
                  {d.items.length ? "" : ", пар нет"}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function ChangesSummary({ changes, now }: { changes: LessonRow[]; now: Date }) {
  return (
    <section aria-labelledby="week-changes-title" className="flex min-w-0 flex-col gap-2">
      <h2 id="week-changes-title" className="text-xl">
        Изменения недели
      </h2>
      {changes.length ? (
        <ul className="flex flex-col divide-y divide-line border-y border-line">
          {changes.map((l) => {
            const c = CHANGE[l.change as keyof typeof CHANGE];
            return (
              <li key={l.id}>
                <a
                  href={`#day-${mskDateKey(l.startsAt)}`}
                  className="flex min-h-11 flex-col gap-1 py-3 hover:bg-muted"
                >
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <StatusChip tone={c.tone} icon={c.icon}>
                      {c.label}
                    </StatusChip>
                    <span
                      className={cn(
                        "text-sm",
                        l.change === "CANCELLED" ? "text-ink-muted line-through" : "text-ink",
                      )}
                    >
                      {formatRelativeDay(l.startsAt, now)}, {formatTime(l.startsAt)}
                    </span>
                  </span>
                  <span className="font-bold text-ink">{l.discipline.name}</span>
                </a>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="border-t border-line pt-3 text-base text-ink-muted">
          На этой неделе без изменений.
        </p>
      )}
    </section>
  );
}
