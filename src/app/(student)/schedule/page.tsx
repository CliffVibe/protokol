import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { DaySection } from "@/components/schedule/day";
import { LessonSheetProvider } from "@/components/schedule/lesson-sheet";
import {
  ChangesSummary,
  DayStrip,
  ScheduleToggle,
  WeekNav,
  weekHref,
} from "@/components/schedule/nav";
import { Button } from "@/components/ui/button";
import { formatLessonCount, formatTime } from "@/lib/dates";
import { addDays, mskDateKey, mskStartOfDay, mskStartOfWeek } from "@/lib/msk";
import { parseWeekParam } from "@/lib/schedule-params";
import { requireStudent } from "@/server/auth/guards";
import { getTodaySchedule, getWeekSchedule } from "@/server/services/schedule";
import type { StudentCtx } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Расписание" };

// Расписание (T06, сценарий «Куда идти»): «Сегодня» по умолчанию, «Неделя» — ?week=YYYY-Www.
// Битый ?week — текущая неделя, не 500 (zod в parseWeekParam). Основная и языковые группы — одной лентой.
// Доступ — requireStudent() первой строкой, до любых данных (CLAUDE.md → «Железные правила»).
export default async function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  const ctx = await requireStudent();
  const { week } = await searchParams;
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Расписание" />
      <ScheduleToggle view={week === undefined ? "today" : "week"} now={now} />
      <LessonSheetProvider>
        {week === undefined ? (
          <TodayView ctx={ctx} now={now} />
        ) : (
          <WeekView
            ctx={ctx}
            now={now}
            weekStart={parseWeekParam(week, now) ?? mskStartOfWeek(now)}
          />
        )}
      </LessonSheetProvider>
    </div>
  );
}

async function TodayView({ ctx, now }: { ctx: StudentCtx; now: Date }) {
  const { day, tomorrow } = await getTodaySchedule(ctx, now);
  const tomorrowStart = addDays(mskStartOfDay(now), 1);
  const weekLink = (
    <Button asChild variant="outline">
      <Link href={weekHref(tomorrowStart, `day-${mskDateKey(tomorrowStart)}`)}>Вся неделя</Link>
    </Button>
  );

  return (
    <div className="flex flex-col gap-8">
      {day.items.length ? (
        <DaySection day={day} now={now} isToday={false} />
      ) : (
        <EmptyState
          title="Сегодня пар нет. Можно выдохнуть"
          description={
            tomorrow
              ? `Завтра ${formatLessonCount(tomorrow.count)}, первая в ${formatTime(tomorrow.firstStartsAt)}.`
              : "Завтра тоже свободно."
          }
          action={weekLink}
        />
      )}
      {day.items.length ? (
        <section aria-labelledby="tomorrow-title" className="flex flex-col gap-2">
          <h2 id="tomorrow-title" className="text-xl">
            Завтра
          </h2>
          <div className="flex flex-col items-start gap-3 border-t border-line pt-3">
            <p className="text-base text-ink">
              {tomorrow
                ? `${formatLessonCount(tomorrow.count)}, первая в ${formatTime(tomorrow.firstStartsAt)}.`
                : "Пар нет."}
            </p>
            {weekLink}
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
  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-start lg:gap-x-12">
      <div className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-1">
        {nav}
        <DayStrip days={days} todayKey={todayKey} />
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
