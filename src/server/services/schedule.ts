import "server-only";
import { travelMinutes } from "@/lib/buildings";
import { addDays, mskDateKey, mskStartOfWeek, mskWeekday } from "@/lib/msk";
import type { StaffCtx, StudentCtx } from "@/server/auth/guards";
import { roomUsage } from "@/server/repos/rooms";
import { lessonsBetween, type LessonRow } from "@/server/repos/schedule";

// Расписание (T06): день и неделя из одного источника — lessonsBetween (группы из ctx, S1).
// Здесь только раскладка по дням и подсказки; запросов к БД, кроме lessonsBetween, нет.
// Исключение — suggestRooms (T14+): подбор свободной аудитории сотруднику при переносе пары (repos/rooms.ts).

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
  /** Время в дороге между корпусами, если известно (lib/buildings.ts); иначе null — не выдумываем */
  travelMinutes: number | null;
};

export type ScheduleItem = {
  lesson: LessonRow;
  transition: Transition | null;
};

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
      travelMinutes: travelMinutes(prev.building, cur.building),
    });
  }
  return result;
}

const roomNumber = (r: string) => (/^\d+$/.test(r) ? Number(r) : NaN);

/**
 * Ближайшие к аудитории по номеру (тот же этаж и крыло): сотруднику при переносе полезнее соседняя
 * аудитория, чем первая по списку. Нечисловая аудитория-ориентир — пусто: «рядом» не выдумываем.
 */
export function nearestRooms(free: string[], target: string, n = 3): string[] {
  const num = roomNumber;
  const t = num(target);
  if (Number.isNaN(t)) return [];
  return free
    .filter((r) => !Number.isNaN(num(r)))
    .sort((a, b) => Math.abs(num(a) - t) - Math.abs(num(b) - t) || num(a) - num(b))
    .slice(0, n);
}

/**
 * Свободные аудитории в промежутке: те, что встречаются в расписании корпуса (`usage` — за неделю), минус
 * занятые парами, которые его пересекают. Только номера — по возрастанию.
 */
export function freeRoomsIn(
  usage: { room: string; startsAt: Date; endsAt: Date }[],
  from: Date,
  to: Date,
): string[] {
  const known = new Set(usage.map((u) => u.room));
  const busy = new Set(
    usage.filter((u) => +u.startsAt < +to && +u.endsAt > +from).map((u) => u.room),
  );
  return [...known]
    .filter((r) => !busy.has(r))
    .sort((a, b) => a.localeCompare(b, "ru", { numeric: true }));
}

/** Сколько свободных аудиторий подсказываем сотруднику при переносе (T14+) */
export const SUGGEST_ROOMS = 4;

/**
 * Перенос пары (T14+): аудитория занята — какие свободны в корпусе в новое время. «Известные» аудитории —
 * из расписания корпуса на неделе нового времени; ближайшие по номеру к занятой, а если номер не числовой —
 * первые по списку. Переносимая пара сама себе не мешает.
 */
export async function suggestRooms(
  ctx: StaffCtx,
  slot: { building: string; room: string; startsAt: Date; endsAt: Date; lessonId: string },
): Promise<string[]> {
  const weekStart = mskStartOfWeek(slot.startsAt);
  const usage = await roomUsage(
    ctx,
    slot.building,
    weekStart,
    addDays(weekStart, 7),
    slot.lessonId,
  );
  const free = freeRoomsIn(usage, slot.startsAt, slot.endsAt).filter((r) => r !== slot.room);
  const near = nearestRooms(free, slot.room, SUGGEST_ROOMS);
  return near.length ? near : free.slice(0, SUGGEST_ROOMS);
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
    items: own.map((lesson) => ({
      lesson,
      transition: transitions.get(lesson.id) ?? null,
    })),
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
