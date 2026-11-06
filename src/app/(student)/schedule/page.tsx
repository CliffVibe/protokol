import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { DaySection } from "@/components/schedule/day";
import { LessonSheetProvider } from "@/components/schedule/lesson-sheet";
import {
  ChangesSummary,
  DayNav,
  DayStrip,
  ScheduleToggle,
  WeekNav,
  dayHref,
  weekHref,
} from "@/components/schedule/nav";
import { Button } from "@/components/ui/button";
import { formatLessonCount, formatRelativeDay, formatTime } from "@/lib/dates";
import { addDays, mskDateKey, mskStartOfDay, mskStartOfWeek } from "@/lib/msk";
import { parseDayParam, parseWeekParam } from "@/lib/schedule-params";
import { requireStudent } from "@/server/auth/guards";
import { getDaySchedule, getWeekSchedule, type DaySchedule } from "@/server/services/schedule";
import type { StudentCtx } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Расписание" };

// Расписание (T06, сценарий «Куда идти»): «День» по умолчанию (сегодня; другой день — ?day=YYYY-MM-DD),
// «Неделя» — ?week=YYYY-Www. Битый параметр — сегодня / текущая неделя, не 500 (zod в schedule-params).
// Основная и языковые группы — одной лентой.
// Доступ — requireStudent() первой строкой, до любых данных (CLAUDE.md → «Железные правила»).
export default async function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  const ctx = await requireStudent();
  const { week, day } = await searchParams;
  const now = new Date();

  if (week !== undefined) {
    const weekStart = parseWeekParam(week, now) ?? mskStartOfWeek(now);
    const thisWeek = +weekStart === +mskStartOfWeek(now);
    return (
      <Shell
        toggle={
          <ScheduleToggle
            view="week"
            // Из текущей недели «День» — сегодня, из другой — её понедельник
            dayHref={dayHref(thisWeek ? now : weekStart, now)}
            weekHref={weekHref(weekStart)}
          />
        }
      >
        <WeekView ctx={ctx} now={now} weekStart={weekStart} />
      </Shell>
    );
  }

  const dayStart = parseDayParam(day, now) ?? mskStartOfDay(now);
  return (
    <Shell
      toggle={
        <ScheduleToggle
          view="day"
          dayHref={dayHref(dayStart, now)}
          weekHref={weekHref(dayStart, `day-${mskDateKey(dayStart)}`)}
        />
      }
    >
      <DayView ctx={ctx} now={now} dayStart={dayStart} />
    </Shell>
  );
}

function Shell({ toggle, children }: { toggle: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Расписание" />
      {toggle}
      <LessonSheetProvider>{children}</LessonSheetProvider>
    </div>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function nextSummary(next: DaySchedule["next"]): string {
  return next
    ? `${formatLessonCount(next.count)}, первая в ${formatTime(next.firstStartsAt)}.`
    : "Пар нет.";
}

async function DayView({ ctx, now, dayStart }: { ctx: StudentCtx; now: Date; dayStart: Date }) {
  const { day, week, next } = await getDaySchedule(ctx, dayStart);
  const isToday = day.key === mskDateKey(now);
  const nextStart = addDays(dayStart, 1);
  const nextLabel = capitalize(formatRelativeDay(nextStart, now));
  const weekLink = (
    <Button asChild variant="outline">
      <Link href={weekHref(nextStart, `day-${mskDateKey(nextStart)}`)}>Вся неделя</Link>
    </Button>
  );

  return (
    <div className="flex flex-col gap-6 lg:max-w-3xl">
      <div className="flex flex-col gap-4">
        <DayNav dayStart={dayStart} now={now} />
        <DayStrip days={week} now={now} selectedKey={day.key} />
      </div>
      {day.items.length ? (
        <DaySection day={day} now={now} isToday={isToday} showTitle={false} />
      ) : (
        <EmptyState
          title={isToday ? "Сегодня пар нет. Можно выдохнуть" : "В этот день пар нет"}
          description={`${nextLabel}: ${nextSummary(next).toLowerCase()}`}
          action={weekLink}
        />
      )}
      {/* «Завтра» — только у сегодняшнего дня: «что у меня завтра» спрашивают именно отсюда */}
      {day.items.length && isToday ? (
        <section aria-labelledby="tomorrow-title" className="flex flex-col gap-2 pt-2">
          <h2 id="tomorrow-title" className="text-xl">
            Завтра
          </h2>
          <div className="flex flex-col items-start gap-3 border-t border-line pt-3">
            <p className="text-base text-ink">{nextSummary(next)}</p>
            <Button asChild variant="outline">
              <Link href={dayHref(nextStart, now)}>Открыть завтра</Link>
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

async function WeekView({ ctx, now, weekStart }: { ctx: StudentCtx; now: Date; weekStart: Date }) {
  const { days, changes } = await getWeekSchedule(ctx, weekStart);
  const todayKey = mskDateKey(now);
  const empty = days.every((d) => d.items.length === 0);

  const nav = <WeekNav weekStart={weekStart} currentWeekStart={mskStartOfWeek(now)} now={now} />;

  if (empty)
    return (
      <div className="flex flex-col gap-6 lg:max-w-2xl">
        {nav}
        {/* «К текущей неделе» уже есть в шапке недели — вторая такая же кнопка не нужна (ux-reviewer, T06) */}
        <EmptyState
          title="На этой неделе пар нет"
          description="Другие недели — стрелками выше или «К текущей неделе»."
        />
      </div>
    );

  // ≥ 1024: слева шапка недели, полоса дней и дни; справа — «Изменения недели».
  // В DOM изменения идут до дней: на телефоне они сверху (как «Ближайшее» в T05); место задаёт сетка.
  // Порядок Tab на десктопе (сначала правая колонка) оставлен по решению человека 06.11.
  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-start lg:gap-x-12">
      <div className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-1">
        {nav}
        <DayStrip days={days} now={now} />
      </div>
      <div className="lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <ChangesSummary changes={changes} now={now} />
      </div>
      <div className="flex min-w-0 flex-col gap-8 pt-2 lg:col-start-1 lg:row-start-2">
        {days.map((d) => (
          <DaySection key={d.key} day={d} now={now} isToday={d.key === todayKey} />
        ))}
      </div>
    </div>
  );
}
