// Человеческие даты (docs/04-design.md → «Тон текстов»). Время вуза — московское, независимо от
// часового пояса сервера и браузера.
import { mskHour, mskStartOfDay } from "./msk";

export const UNIVERSITY_TIME_ZONE = "Europe/Moscow";

const LONG_DAY = new Intl.DateTimeFormat("ru-RU", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: UNIVERSITY_TIME_ZONE,
});

/** «Пятница, 6 ноября» — для заголовка «Сейчас». */
export function formatLongDay(date: Date): string {
  const text = LONG_DAY.format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const TIME = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: UNIVERSITY_TIME_ZONE,
});
const SHORT_DAY = new Intl.DateTimeFormat("ru-RU", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: UNIVERSITY_TIME_ZONE,
});
const DAY_MS = 24 * 60 * 60 * 1000;

/** «09:30» по Москве. */
export function formatTime(date: Date): string {
  return TIME.format(date);
}

/** «сегодня» / «завтра» / «вчера» / «пн, 9 нояб.» — относительно `now`, по московским суткам. */
export function formatRelativeDay(date: Date, now: Date): string {
  const diff = Math.round((+mskStartOfDay(date) - +mskStartOfDay(now)) / DAY_MS);
  if (diff === 0) return "сегодня";
  if (diff === 1) return "завтра";
  if (diff === -1) return "вчера";
  return SHORT_DAY.format(date);
}

/** «Доброе утро» и т. д. — по московскому часу. */
export function greetingFor(now: Date): string {
  const hour = mskHour(now);
  if (hour >= 5 && hour < 12) return "Доброе утро";
  if (hour >= 12 && hour < 18) return "Добрый день";
  if (hour >= 18 && hour < 23) return "Добрый вечер";
  return "Доброй ночи";
}

/** «через 25 мин» / «через 2 ч 10 мин» / «идёт, до конца 40 мин». */
export function formatCountdown(startsAt: Date, endsAt: Date, now: Date): string {
  const minutes = (ms: number) => Math.max(1, Math.ceil(ms / 60_000));
  const span = (m: number) => {
    const h = Math.floor(m / 60);
    const rest = m % 60;
    if (h === 0) return `${rest} мин`;
    return rest === 0 ? `${h} ч` : `${h} ч ${rest} мин`;
  };
  if (now >= startsAt && now < endsAt) return `идёт, до конца ${span(minutes(+endsAt - +now))}`;
  if (now < startsAt) return `через ${span(minutes(+startsAt - +now))}`;
  return "закончилась";
}

const DAY_MONTH = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: UNIVERSITY_TIME_ZONE,
});
const WEEKDAY_SHORT = new Intl.DateTimeFormat("ru-RU", {
  weekday: "short",
  timeZone: UNIVERSITY_TIME_ZONE,
});
const DAY_NUMBER = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  timeZone: UNIVERSITY_TIME_ZONE,
});

const YEAR = new Intl.DateTimeFormat("ru-RU", { year: "numeric", timeZone: UNIVERSITY_TIME_ZONE });

/**
 * «13–20 января» / «30 ноября – 6 декабря» / «13 января» (один день). Год — если `to` не в году `now`:
 * «17–23 мая 2027» (ux-reviewer, T06).
 */
export function formatDayRange(from: Date, to: Date, now?: Date): string {
  const a = DAY_MONTH.format(from);
  const b = DAY_MONTH.format(to);
  const [fromDay, ...fromMonth] = a.split(" ");
  const toMonth = b.split(" ").slice(1);
  const range =
    a === b ? a : fromMonth.join(" ") === toMonth.join(" ") ? `${fromDay}–${b}` : `${a} – ${b}`;
  return now && YEAR.format(to) !== YEAR.format(now) ? `${range} ${YEAR.format(to)}` : range;
}

/** «9–15 ноября» — неделя с понедельника `weekStart` (см. formatDayRange). */
export function formatWeekRange(weekStart: Date, now?: Date): string {
  return formatDayRange(weekStart, new Date(weekStart.getTime() + 6 * DAY_MS), now);
}

/** «20 января» по Москве. */
export function formatDayMonth(date: Date): string {
  return DAY_MONTH.format(date);
}

/** Для полосы дней: { weekday: "пн", day: "9" }. */
export function formatDayShort(date: Date): { weekday: string; day: string } {
  return { weekday: WEEKDAY_SHORT.format(date), day: DAY_NUMBER.format(date) };
}

const MONTH_SHORT = new Intl.DateTimeFormat("ru-RU", {
  month: "short",
  timeZone: UNIVERSITY_TIME_ZONE,
});

/** Число и месяц коротко — «11» и «нояб.»: дата крупно столбцом слева (блок «Скоро», Б′). */
export function formatDayAndMonth(date: Date): { day: string; month: string } {
  return { day: DAY_NUMBER.format(date), month: MONTH_SHORT.format(date) };
}

/** Русское множественное: plural(3, ["пара", "пары", "пар"]) → «пары». */
export function plural(n: number, [one, few, many]: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** «1 пара», «3 пары», «5 пар». */
export function formatLessonCount(n: number): string {
  return `${n} ${plural(n, ["пара", "пары", "пар"])}`;
}

/** «сегодня» / «завтра» / «через 3 дня» / «через 5 дней» — по числу московских суток. */
export function formatInDays(days: number): string {
  if (days <= 0) return "сегодня";
  if (days === 1) return "завтра";
  // Неразрывный пробел: «через 3» и «дня» не разъезжаются по строкам
  return `через ${days}\u00a0${plural(days, ["день", "дня", "дней"])}`;
}

/** «было 09:00» — если тот же день, иначе «было вчера, 09:00» / «было пн, 9 нояб., 09:00». */
export function formatWas(original: Date, actual: Date, now: Date): string {
  const sameDay = +mskStartOfDay(original) === +mskStartOfDay(actual);
  return sameDay
    ? `было ${formatTime(original)}`
    : `было ${formatRelativeDay(original, now)}, ${formatTime(original)}`;
}
