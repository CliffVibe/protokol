import "server-only";
import { addDays, mskDateKey, mskStartOfDay, mskWeekday } from "@/lib/msk";
import type { StudentCtx } from "@/server/auth/guards";
import { lessonsBetween, type LessonRow } from "@/server/repos/schedule";

// Расписание (T06): день и неделя из одного источника — lessonsBetween (группы из ctx, S1).
// Здесь только раскладка по дням и подсказки; запросов к БД, кроме lessonsBetween, нет.

/** Подряд две пары в разных корпусах: показываем над второй, сколько времени на переход. */
export type Transition = { from: string; to: string; breakMinutes: number };

export type ScheduleItem = { lesson: LessonRow; transition: Transition | null };

export type ScheduleDay = {
  /** Полночь дня по Москве */
  start: Date;
  /** YYYY-MM-DD — для якоря #day-… */
  key: string;
  items: ScheduleItem[];
};

export type WeekSchedule = {
  weekStart: Date;
  days: ScheduleDay[];
  /** Все изменения недели по времени — для блока «Изменения недели» */
  changes: LessonRow[];
};

export type TodaySchedule = {
  day: ScheduleDay;
  /** Сводка на завтра: сколько пар (без отменённых) и когда первая; null — завтра пар нет */
  tomorrow: { key: string; count: number; firstStartsAt: Date } | null;
};

/** Переходы между корпусами за день: только соседние неотменённые пары (на отменённую не идут). */
export function buildTransitions(dayLessons: LessonRow[]): Map<string, Transition> {
  const live = dayLessons
    .filter((l) => l.change !== "CANCELLED")
    .sort((a, b) => +a.startsAt - +b.startsAt);
  const result = new Map<string, Transition>();
  for (let i = 1; i < live.length; i++) {
    const prev = live[i - 1]!;
    const cur = live[i]!;
    if (prev.building === cur.building) continue;
    result.set(cur.id, {
      from: prev.building,
      to: cur.building,
      breakMinutes: Math.max(0, Math.round((+cur.startsAt - +prev.endsAt) / 60_000)),
    });
  }
  return result;
}

function toDay(start: Date, lessons: LessonRow[]): ScheduleDay {
  const key = mskDateKey(start);
  const own = lessons
    .filter((l) => mskDateKey(l.startsAt) === key)
    .sort((a, b) => +a.startsAt - +b.startsAt);
  const transitions = buildTransitions(own);
  return {
    start,
    key,
    items: own.map((lesson) => ({ lesson, transition: transitions.get(lesson.id) ?? null })),
  };
}

/** Пн–сб всегда (пустой учебный день — «Пар нет»), воскресенье — только если в нём есть пары. */
export function groupByDay(lessons: LessonRow[], weekStart: Date): ScheduleDay[] {
  const days: ScheduleDay[] = [];
  for (let i = 0; i < 7; i++) {
    const day = toDay(addDays(weekStart, i), lessons);
    if (mskWeekday(day.start) === 7 && day.items.length === 0) continue;
    days.push(day);
  }
  return days;
}

export function weekChanges(lessons: LessonRow[]): LessonRow[] {
  return lessons.filter((l) => l.change !== "NONE").sort((a, b) => +a.startsAt - +b.startsAt);
}

export async function getWeekSchedule(ctx: StudentCtx, weekStart: Date): Promise<WeekSchedule> {
  const lessons = await lessonsBetween(ctx, weekStart, addDays(weekStart, 7));
  return { weekStart, days: groupByDay(lessons, weekStart), changes: weekChanges(lessons) };
}

export async function getTodaySchedule(ctx: StudentCtx, now: Date): Promise<TodaySchedule> {
  const today = mskStartOfDay(now);
  const tomorrowStart = addDays(today, 1);
  const lessons = await lessonsBetween(ctx, today, addDays(today, 2));
  const tomorrowLive = toDay(tomorrowStart, lessons).items.filter(
    (i) => i.lesson.change !== "CANCELLED",
  );
  return {
    day: toDay(today, lessons),
    tomorrow: tomorrowLive.length
      ? {
          key: mskDateKey(tomorrowStart),
          count: tomorrowLive.length,
          firstStartsAt: tomorrowLive[0]!.lesson.startsAt,
        }
      : null,
  };
}
