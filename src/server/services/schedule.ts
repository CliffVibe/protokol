import "server-only";
import { addDays, mskDateKey, mskStartOfWeek, mskWeekday } from "@/lib/msk";
import type { StudentCtx } from "@/server/auth/guards";
import { lessonsBetween, type LessonRow } from "@/server/repos/schedule";

// Расписание (T06): день и неделя из одного источника — lessonsBetween (группы из ctx, S1).
// Здесь только раскладка по дням и подсказки; запросов к БД, кроме lessonsBetween, нет.

/**
 * Подряд две пары в разных корпусах. Показываем отдельной строкой между ними: когда перерыв
 * (`startsAt`–`endsAt`), откуда и куда идти (человек на проверке T06: внутри пары было непонятно).
 */
export type Transition = {
  from: string;
  to: string;
  /** Конец предыдущей неотменённой пары */
  startsAt: Date;
  /** Начало пары, на которую идём */
  endsAt: Date;
  breakMinutes: number;
};

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

export type DaySchedule = {
  day: ScheduleDay;
  /** Дни недели выбранного дня — для полосы «пн…сб» (выбранное воскресенье — тоже в ней) */
  week: ScheduleDay[];
  /** Сводка на следующий день: сколько пар (без отменённых) и когда первая; null — пар нет */
  next: { key: string; count: number; firstStartsAt: Date } | null;
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
      startsAt: prev.endsAt,
      endsAt: cur.startsAt,
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

/**
 * День (`dayStart` — полночь по Москве) с полосой его недели и сводкой следующего дня.
 * Один lessonsBetween: от понедельника до конца недели (или до конца следующего дня, если день — вс).
 */
export async function getDaySchedule(ctx: StudentCtx, dayStart: Date): Promise<DaySchedule> {
  const weekStart = mskStartOfWeek(dayStart);
  const nextStart = addDays(dayStart, 1);
  const until = new Date(Math.max(+addDays(weekStart, 7), +addDays(dayStart, 2)));
  const lessons = await lessonsBetween(ctx, weekStart, until);
  const day = toDay(dayStart, lessons);
  const week = groupByDay(lessons, weekStart);
  if (!week.some((d) => d.key === day.key)) week.push(day);
  const nextLive = toDay(nextStart, lessons).items.filter((i) => i.lesson.change !== "CANCELLED");
  return {
    day,
    week,
    next: nextLive.length
      ? {
          key: mskDateKey(nextStart),
          count: nextLive.length,
          firstStartsAt: nextLive[0]!.lesson.startsAt,
        }
      : null,
  };
}
