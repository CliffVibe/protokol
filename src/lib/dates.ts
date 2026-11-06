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

/** «было 09:00» — если тот же день, иначе «было вчера, 09:00» / «было пн, 9 нояб., 09:00». */
export function formatWas(original: Date, actual: Date, now: Date): string {
  const sameDay = +mskStartOfDay(original) === +mskStartOfDay(actual);
  return sameDay
    ? `было ${formatTime(original)}`
    : `было ${formatRelativeDay(original, now)}, ${formatTime(original)}`;
}
