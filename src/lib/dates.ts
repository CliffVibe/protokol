// Человеческие даты (docs/04-design.md → «Тон текстов»). Время вуза — московское, независимо от
// часового пояса сервера и браузера.
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
