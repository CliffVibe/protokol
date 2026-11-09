// Навигация расписания: «День / Неделя», переход по дням и неделям, полоса дней, изменения недели.
// Всё — обычные ссылки: работает без JS, с клавиатуры, и адрес недели можно переслать.
import Link from "next/link";
import type { Route } from "next";
import { ChevronLeft, ChevronRight, CircleAlert } from "lucide-react";
import {
  formatDayShort,
  formatLongDay,
  formatRelativeDay,
  formatTime,
  formatWeekRange,
} from "@/lib/dates";
import { addDays, formatIsoWeek, mskDateKey, mskStartOfDay, mskStartOfWeek } from "@/lib/msk";
import { cn } from "@/lib/utils";
import type { LessonRow } from "@/server/repos/schedule";
import type { ScheduleDay } from "@/server/services/schedule";
import { CHANGE } from "@/components/now/labels";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";

export const weekHref = (d: Date, hash?: string) =>
  `/schedule?week=${formatIsoWeek(d)}${hash ? `#${hash}` : ""}` as Route;

/** Адрес дня; сегодня — просто /schedule (один адрес на один экран). */
export const dayHref = (d: Date, now: Date) =>
  (mskDateKey(d) === mskDateKey(now) ? "/schedule" : `/schedule?day=${mskDateKey(d)}`) as Route;

/**
 * Адреса расписания на две недели (текущая и следующая) — их service worker сохраняет для офлайна (T11):
 * «сегодня», каждый день и обе недели. Тот же формат, что у ссылок выше, — календарь в воркере не нужен.
 */
export function offlineScheduleUrls(now: Date): string[] {
  const weekStart = mskStartOfWeek(now);
  const days = Array.from(
    { length: 14 },
    (_, i) => `/schedule?day=${mskDateKey(addDays(weekStart, i))}`,
  );
  return [
    "/schedule",
    `/schedule?day=${mskDateKey(now)}`,
    `/schedule?week=${formatIsoWeek(weekStart)}`,
    `/schedule?week=${formatIsoWeek(addDays(weekStart, 7))}`,
    ...days,
  ].filter((u, i, all) => all.indexOf(u) === i);
}

export function ScheduleToggle({
  view,
  dayHref,
  weekHref,
}: {
  view: "day" | "week";
  dayHref: Route;
  weekHref: Route;
}) {
  const items = [
    { key: "day", label: "День", href: dayHref },
    { key: "week", label: "Неделя", href: weekHref },
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

function relativeDay(offset: number): string | null {
  if (offset === 0) return "Сегодня";
  if (offset === 1) return "Завтра";
  if (offset === -1) return "Вчера";
  return null;
}

/** Шапка дня: ‹ день › по одному дню, «К сегодня» — на месте подписи, без сдвига вёрстки. */
export function DayNav({ dayStart, now }: { dayStart: Date; now: Date }) {
  const offset = Math.round((+dayStart - +mskStartOfDay(now)) / (24 * 3600 * 1000));
  const prev = addDays(dayStart, -1);
  const next = addDays(dayStart, 1);
  return (
    <ArrowsNav
      label="Соседние дни"
      prev={{ href: dayHref(prev, now), label: `Предыдущий день, ${formatLongDay(prev)}` }}
      next={{ href: dayHref(next, now), label: `Следующий день, ${formatLongDay(next)}` }}
      title={formatLongDay(dayStart)}
      relative={relativeDay(offset)}
      back={offset !== 0 ? { href: "/schedule" as Route, label: "К сегодня" } : null}
    />
  );
}

/** Общая шапка дня и недели: стрелки 44px по краям, посередине — заголовок и подпись. */
function ArrowsNav({
  label,
  prev,
  next,
  title,
  relative,
  back,
}: {
  label: string;
  prev: { href: Route; label: string };
  next: { href: Route; label: string };
  title: string;
  relative: string | null;
  back: { href: Route; label: string } | null;
}) {
  return (
    <nav aria-label={label}>
      <div className="flex items-start justify-between gap-2">
        {/* Размер цели — в px: при тексте 200% стрелки не растут и не наезжают на даты (урок T04) */}
        <Button asChild variant="outline" size="icon" className="size-[44px]">
          <Link href={prev.href} aria-label={prev.label}>
            <ChevronLeft aria-hidden className="size-5" />
          </Link>
        </Button>
        <div className="flex min-w-0 flex-1 flex-col items-center text-center break-words">
          <p className="font-heading text-lg font-semibold text-ink tabular">{title}</p>
          {/* Высота строки постоянная: ссылка «назад» появляется на месте, ничего ниже не сдвигается */}
          <p className="flex min-h-11 flex-wrap items-center justify-center gap-x-3 text-sm">
            {relative ? <span className="text-ink-muted">{relative}</span> : null}
            {back ? (
              <Link
                href={back.href}
                className="inline-flex min-h-11 items-center font-bold text-brand underline-offset-4 hover:underline"
              >
                {back.label}
              </Link>
            ) : null}
          </p>
        </div>
        <Button asChild variant="outline" size="icon" className="size-[44px]">
          <Link href={next.href} aria-label={next.label}>
            <ChevronRight aria-hidden className="size-5" />
          </Link>
        </Button>
      </div>
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
  now,
}: {
  weekStart: Date;
  currentWeekStart: Date;
  now: Date;
}) {
  const offset = Math.round((+weekStart - +currentWeekStart) / (7 * 24 * 3600 * 1000));
  const prev = addDays(weekStart, -7);
  const next = addDays(weekStart, 7);
  return (
    <ArrowsNav
      label="Недели"
      prev={{ href: weekHref(prev), label: `Предыдущая неделя, ${formatWeekRange(prev, now)}` }}
      next={{ href: weekHref(next), label: `Следующая неделя, ${formatWeekRange(next, now)}` }}
      title={formatWeekRange(weekStart, now)}
      relative={relativeWeek(offset)}
      back={offset !== 0 ? { href: weekHref(currentWeekStart), label: "К текущей неделе" } : null}
    />
  );
}

/**
 * Пн…сб недели: касание открывает день отдельно (?day=) — и из «Дня», и из «Недели»
 * (человек на проверке T06: «удобно смотреть отдельно по дням»).
 * Выбранный день — ультрамариновый квадрат под числом, полужирный и aria-current="date" (Б′, 10.11);
 * сегодня — точка под числом и скрытое «сегодня», изменения — значок: не только цветом.
 */
export function DayStrip({
  days,
  now,
  selectedKey,
}: {
  days: ScheduleDay[];
  now: Date;
  selectedKey?: string;
}) {
  const todayKey = mskDateKey(now);
  return (
    <nav aria-label="Дни недели">
      <ul className="flex flex-wrap">
        {days.map((d) => {
          const { weekday, day } = formatDayShort(d.start);
          const isToday = d.key === todayKey;
          const selected = d.key === selectedKey;
          const changed = d.items.some((i) => i.lesson.change !== "NONE");
          return (
            <li key={d.key} className="min-w-[44px] flex-1">
              <Link
                href={dayHref(d.start, now)}
                // «page» уже у «День» в переключателе; выбранный день — «date», сегодня — скрытым текстом
                aria-current={selected ? "date" : undefined}
                className={cn(
                  "group flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-center",
                  selected ? "font-semibold text-ink" : "text-ink-muted",
                )}
              >
                <span className="text-sm">{weekday}</span>
                {/* Выбранный день — ультрамариновый квадрат (Б′): минимум 40px, при тексте 200% растёт вместе с числом */}
                <span
                  className={cn(
                    "flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl px-1 font-heading text-base font-semibold tabular",
                    selected
                      ? "bg-plate text-on-plate forced-colors:border-2 forced-colors:border-[Highlight]"
                      : "text-ink group-hover:bg-surface",
                  )}
                >
                  {day}
                </span>
                {/* Место под отметки есть у каждого дня — полоса не прыгает */}
                <span aria-hidden className="flex h-[14px] items-center gap-[3px]">
                  {changed ? <CircleAlert className="size-[13px] text-warn" /> : null}
                  {isToday ? <span className="size-[5px] rounded-full bg-brand" /> : null}
                </span>
                <span className="sr-only">
                  {isToday ? ", сегодня" : ""}
                  {changed ? ", есть изменения" : ""}
                  {d.items.length ? "" : ", пар нет"}
                </span>
              </Link>
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
      <h2 id="week-changes-title" className="text-lg">
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
                  className="flex min-h-11 flex-col gap-1 py-3 hover:bg-surface"
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
