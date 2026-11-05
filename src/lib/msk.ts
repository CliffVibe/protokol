// Время по Москве без зависимостей: Europe/Moscow = UTC+3 круглый год (перехода на летнее время нет с 2014).
// Все даты в БД — UTC-моменты; «день» и «неделя» считаются по Москве (docs/06-seed-data.md → «Правило дат»).

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Начало московских суток, в которые попадает момент `d`. */
export function mskStartOfDay(d: Date): Date {
  const shifted = d.getTime() + MSK_OFFSET_MS;
  return new Date(shifted - (shifted % DAY_MS) - MSK_OFFSET_MS);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** День недели по Москве: 1 = понедельник … 7 = воскресенье (ISO). */
export function mskWeekday(d: Date): number {
  const day = new Date(d.getTime() + MSK_OFFSET_MS).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Понедельник московской недели, в которую попадает `d` (начало суток). */
export function mskStartOfWeek(d: Date): Date {
  const start = mskStartOfDay(d);
  return addDays(start, 1 - mskWeekday(start));
}

/** Момент «ЧЧ:ММ по Москве» в сутки, начинающиеся в `dayStart` (результат mskStartOfDay). */
export function mskAt(dayStart: Date, time: string): Date {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) throw new Error(`Время должно быть в формате ЧЧ:ММ: ${time}`);
  const [, hh, mm] = match;
  return new Date(dayStart.getTime() + (Number(hh) * 60 + Number(mm)) * 60 * 1000);
}

/** Календарная дата по Москве в виде YYYY-MM-DD (для ключей и id). */
export function mskDateKey(d: Date): string {
  return new Date(d.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10);
}

/** Год по Москве. */
export function mskYear(d: Date): number {
  return new Date(d.getTime() + MSK_OFFSET_MS).getUTCFullYear();
}
