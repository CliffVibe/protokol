import "server-only";
import { addDays, mskDateKey, mskStartOfWeek, mskWeekday } from "@/lib/msk";
import type { StudentCtx } from "@/server/auth/guards";
import { roomUsage } from "@/server/repos/rooms";
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

/**
 * Окно между парами (T14, «Свободные аудитории»): перерыв от часа — и какие аудитории корпуса следующей
 * пары свободны в это время по расписанию (без групп и людей — только номера, repos/rooms.ts).
 */
export type FreeWindow = {
  startsAt: Date;
  endsAt: Date;
  minutes: number;
  building: string;
  /** От какой аудитории считаем «рядом»: следующей пары, а если её номер не числовой (Л-503) — прошлой */
  nearRoom: string;
  nearOf: NearOf;
  /** Свободные аудитории — по возрастанию номера; пусто — свободных по расписанию нет */
  free: string[];
  /** Сколько аудиторий корпуса вообще встречается в расписании недели */
  known: number;
  /** До трёх свободных — ближайшие по номеру к аудитории следующей пары */
  near: string[];
};

/** Окно — от часа: короткий перерыв уходит на дорогу и очередь в буфет */
export const WINDOW_MIN_MINUTES = 60;

export type ScheduleItem = {
  lesson: LessonRow;
  transition: Transition | null;
  /** Только в виде «День»: окно перед этой парой */
  window: FreeWindow | null;
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
    });
  }
  return result;
}

type WindowSlot = Omit<FreeWindow, "free" | "known" | "near">;

/** Окна за день: соседние неотменённые пары с перерывом от WINDOW_MIN_MINUTES; корпус — следующей пары. */
export function buildWindows(dayLessons: LessonRow[]): Map<string, WindowSlot> {
  const live = dayLessons
    .filter((l) => l.change !== "CANCELLED")
    .sort((a, b) => +a.startsAt - +b.startsAt);
  const result = new Map<string, WindowSlot>();
  for (let i = 1; i < live.length; i++) {
    const prev = live[i - 1]!;
    const cur = live[i]!;
    const minutes = Math.round((+cur.startsAt - +prev.endsAt) / 60_000);
    if (minutes < WINDOW_MIN_MINUTES) continue;
    result.set(cur.id, {
      startsAt: prev.endsAt,
      endsAt: cur.startsAt,
      minutes,
      building: cur.building,
      ...anchorRoom(prev.room, cur.room),
    });
  }
  return result;
}

const roomNumber = (r: string) => (/^\d+$/.test(r) ? Number(r) : NaN);

export type NearOf = "next" | "prev" | null;

/**
 * От какой аудитории считать «рядом»: следующей пары; если её номер не числовой (языковые Л-503) —
 * прошлой; если обе нечисловые — ни от какой (не выдаём первые по списку за «рядом»).
 */
export function anchorRoom(
  prevRoom: string,
  nextRoom: string,
): { nearRoom: string; nearOf: NearOf } {
  if (!Number.isNaN(roomNumber(nextRoom))) return { nearRoom: nextRoom, nearOf: "next" };
  if (!Number.isNaN(roomNumber(prevRoom))) return { nearRoom: prevRoom, nearOf: "prev" };
  return { nearRoom: "", nearOf: null };
}

/**
 * Ближайшие к аудитории по номеру (тот же этаж и крыло). Пять первых номеров списка ничего не говорили,
 * куда идти (ux-reviewer, T14). Нечисловая аудитория-ориентир — пусто: «рядом» не выдумываем.
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
 * Свободные аудитории в окне: те, что встречаются в расписании корпуса (`usage` — за неделю), минус занятые
 * парами, которые пересекают окно. Только номера — по возрастанию.
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

/** Окна дня со свободными аудиториями: по одному запросу на корпус за неделю дня. */
async function windowsWithRooms(
  ctx: StudentCtx,
  dayLessons: LessonRow[],
  weekStart: Date,
): Promise<Map<string, FreeWindow>> {
  const slots = buildWindows(dayLessons);
  const result = new Map<string, FreeWindow>();
  if (!slots.size) return result;
  const buildings = [...new Set([...slots.values()].map((w) => w.building))];
  const usageBy = new Map(
    await Promise.all(
      buildings.map(
        async (b) => [b, await roomUsage(ctx, b, weekStart, addDays(weekStart, 7))] as const,
      ),
    ),
  );
  for (const [lessonId, w] of slots) {
    const usage = usageBy.get(w.building) ?? [];
    const free = freeRoomsIn(usage, w.startsAt, w.endsAt);
    result.set(lessonId, {
      ...w,
      free,
      known: new Set(usage.map((u) => u.room)).size,
      near: nearestRooms(free, w.nearRoom),
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
    items: own.map((lesson) => ({
      lesson,
      transition: transitions.get(lesson.id) ?? null,
      window: null,
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
  const plainDay = toDay(dayStart, lessons);
  // T14: окна от часа — со свободными аудиториями (только в виде «День»)
  const windows = await windowsWithRooms(
    ctx,
    plainDay.items.map((i) => i.lesson),
    weekStart,
  );
  const day = {
    ...plainDay,
    items: plainDay.items.map((i) => ({ ...i, window: windows.get(i.lesson.id) ?? null })),
  };
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
