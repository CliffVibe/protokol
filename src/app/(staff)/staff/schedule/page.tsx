import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { CalendarClock, ChevronLeft, ChevronRight, CircleX } from "lucide-react";
import { z } from "zod";
import { EmptyState } from "@/components/empty-state";
import { LESSON_KIND } from "@/components/now/labels";
import { PageHeader } from "@/components/page-header";
import { RescheduleDialog } from "@/components/staff/reschedule-dialog";
import { Button } from "@/components/ui/button";
import { formatLongDay, formatTime, formatWas } from "@/lib/dates";
import { addDays, mskDateKey, mskStartOfDay } from "@/lib/msk";
import { dayParamSchema } from "@/lib/schedule-params";
import { cn } from "@/lib/utils";
import { requireStaff } from "@/server/auth/guards";
import {
  groupLessonsBetween,
  groupsForStaff,
  nextLessonStart,
} from "@/server/repos/staff-schedule";
import { RESCHEDULE_DAYS_AHEAD } from "@/server/services/staff-rules";

export const metadata: Metadata = { title: "Расписание групп" };

// Расписание групп сотрудника (T09): группа и день — GET-формой (работает без JS, адрес можно переслать),
// у пары — «Перенести» в нативном диалоге. Только академические группы своих факультетов (S1, в репозитории):
// чужая группа из адреса молча заменяется первой своей. Доступ — requireStaff() первой строкой.

const idSchema = z.string().regex(/^[A-Za-z0-9-]{1,80}$/);

function href(group: string, day: Date): Route {
  return `/staff/schedule?group=${encodeURIComponent(group)}&day=${mskDateKey(day)}` as Route;
}

export default async function StaffSchedulePage({ searchParams }: PageProps<"/staff/schedule">) {
  const ctx = await requireStaff();
  const sp = await searchParams;
  const now = new Date();
  const today = mskStartOfDay(now);

  const groups = await groupsForStaff(ctx);
  const raw = idSchema.safeParse(sp.group);
  const group = groups.find((g) => raw.success && g.id === raw.data) ?? groups[0] ?? null;
  const dayParsed = dayParamSchema.safeParse(sp.day);
  // Без ?day — ближайший день, где пары ещё впереди (вечером «сегодня» — одни «Прошла»; ux-reviewer T09)
  const upcoming = !dayParsed.success && group ? await nextLessonStart(ctx, group.id, now) : null;
  const day = dayParsed.success
    ? dayParsed.data
    : upcoming && upcoming < addDays(today, 14)
      ? mskStartOfDay(upcoming)
      : today;
  const isToday = +day === +today;

  if (!group)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Расписание групп" />
        <EmptyState title="У ваших факультетов нет групп" description="Переносить пока нечего." />
      </div>
    );

  const lessons = await groupLessonsBetween(ctx, group.id, day, addDays(day, 1));
  const maxDay = addDays(today, RESCHEDULE_DAYS_AHEAD);

  return (
    <div className="flex flex-col gap-6 lg:max-w-3xl">
      <PageHeader
        title="Расписание групп"
        description="Перенос пары сразу приходит студентам группы уведомлением и появляется у них на главной."
      />

      <form action="/staff/schedule" className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[min(14rem,100%)] flex-col gap-1.5 text-sm font-bold text-ink">
          Группа
          <select
            name="group"
            defaultValue={group.id}
            className="h-11 rounded-lg border border-input bg-surface px-3 text-base font-normal text-ink"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} — {g.program.faculty.code}, {g.course} курс
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[min(12rem,100%)] flex-col gap-1.5 text-sm font-bold text-ink">
          День
          <input
            type="date"
            name="day"
            defaultValue={mskDateKey(day)}
            className="h-11 rounded-lg border border-input bg-surface px-3 text-base font-normal text-ink"
          />
        </label>
        <Button type="submit" variant="outline">
          Показать
        </Button>
      </form>

      {/* Заголовок дня — первой строкой, стрелки и «К сегодня» — второй: на 360 не три строки (ux-reviewer T09) */}
      <div className="flex flex-col gap-1 border-b border-line pb-2">
        <h2 className="text-lg break-words">
          {group.name}, {formatLongDay(day).toLowerCase()}
          {isToday ? <span className="text-ink-muted"> (сегодня)</span> : null}
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-x-4">
          <Link
            href={href(group.id, addDays(day, -1))}
            className="inline-flex min-h-11 min-w-11 items-center gap-1 rounded-lg pr-2 text-base text-brand hover:underline"
          >
            <ChevronLeft aria-hidden className="size-5" />
            Предыдущий
            <span className="sr-only"> день</span>
          </Link>
          {isToday ? null : (
            <Link
              href={href(group.id, today)}
              className="inline-flex min-h-11 items-center rounded-lg px-2 text-base text-brand hover:underline"
            >
              К сегодня
            </Link>
          )}
          <Link
            href={href(group.id, addDays(day, 1))}
            className="inline-flex min-h-11 min-w-11 items-center gap-1 rounded-lg pl-2 text-base text-brand hover:underline"
          >
            Следующий
            <span className="sr-only"> день</span>
            <ChevronRight aria-hidden className="size-5" />
          </Link>
        </div>
      </div>

      {lessons.length ? (
        <ul
          aria-label={`Пары группы ${group.name}`}
          className="flex flex-col divide-y divide-line border-b border-line"
        >
          {lessons.map((l) => {
            const cancelled = l.change === "CANCELLED";
            const past = l.startsAt <= now;
            const title = `${l.discipline.name}, ${formatTime(l.startsAt)}`;
            return (
              <li
                key={l.id}
                data-lesson={l.id}
                className="flex flex-wrap items-start gap-x-4 gap-y-2 py-4"
              >
                <p className="w-20 shrink-0 font-heading text-lg tabular">
                  {formatTime(l.startsAt)}
                  {/* Конец пары — Onest: Unbounded загружен только 600, font-normal им не нарисовать (ux-reviewer, T13) */}
                  <span className="block font-sans text-sm text-ink-muted">
                    {formatTime(l.endsAt)}
                  </span>
                </p>
                {/* min-w: при тексте 200% колонка уходит под время, а не сжимается до слова в строке */}
                <div className="flex min-w-[min(12rem,100%)] flex-1 flex-col gap-1 break-words">
                  <p className={cn("text-base font-bold break-words", cancelled && "line-through")}>
                    {l.discipline.name}
                  </p>
                  <p className="text-sm text-ink-muted">
                    {LESSON_KIND[l.kind]}, {l.building}, ауд.&nbsp;{l.room}
                  </p>
                  <p className="text-sm text-ink-muted">{l.teacher.fullName}</p>
                  {l.change === "MOVED" && l.originalStartsAt ? (
                    <p className="flex items-start gap-1.5 text-sm text-warn">
                      <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0" />
                      <span>
                        Перенос, {formatWas(l.originalStartsAt, l.startsAt, now)}
                        {l.changeNote ? `. ${l.changeNote}` : null}
                      </span>
                    </p>
                  ) : null}
                  {cancelled ? (
                    <p className="flex items-start gap-1.5 text-sm text-danger">
                      <CircleX aria-hidden className="mt-0.5 size-4 shrink-0" />
                      Отменена{l.changeNote ? `. ${l.changeNote}` : null}
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0">
                  {cancelled ? null : past ? (
                    <p className="pt-2 text-sm text-ink-muted">Прошла</p>
                  ) : (
                    <RescheduleDialog
                      lessonId={l.id}
                      startsAt={l.startsAt.toISOString()}
                      title={title}
                      defaultDate={mskDateKey(l.startsAt)}
                      defaultTime={formatTime(l.startsAt)}
                      room={l.room}
                      minDate={mskDateKey(today)}
                      maxDate={mskDateKey(maxDay)}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          title={`У группы ${group.name} в этот день пар нет`}
          description="Выберите другой день или группу."
        />
      )}
    </div>
  );
}
