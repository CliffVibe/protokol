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

/**
 * Полночь по Москве для ключа YYYY-MM-DD или `null`, если такой даты нет (2026-02-30, 2026-13-01).
 * Обратно к `mskDateKey`: адрес дня в расписании — ?day=2026-11-05.
 */
export function mskDayFromKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const day = new Date(Date.UTC(y, m - 1, d) - MSK_OFFSET_MS);
  return mskDateKey(day) === key ? day : null;
}

/** Год по Москве. */
export function mskYear(d: Date): number {
  return new Date(d.getTime() + MSK_OFFSET_MS).getUTCFullYear();
}

/** Час по Москве, 0–23. */
export function mskHour(d: Date): number {
  return new Date(d.getTime() + MSK_OFFSET_MS).getUTCHours();
}

// ── ISO-неделя (пн–вс) по Москве: адрес недели в URL расписания — ?week=2026-W46 (T06) ──

const WEEK_MS = 7 * DAY_MS;

/** Полночь по Москве на календарную дату (месяц — с 0, как в Date.UTC). */
function mskMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day) - MSK_OFFSET_MS);
}

/** Понедельник первой ISO-недели года: неделя, где лежит 4 января. */
function isoWeekOneStart(year: number): Date {
  return mskStartOfWeek(mskMidnight(year, 0, 4));
}

/** ISO-год и номер недели момента `d` по Москве: 31 декабря может быть W01 следующего года. */
export function isoWeekOf(d: Date): { year: number; week: number } {
  const monday = mskStartOfWeek(d);
  const year = mskYear(addDays(monday, 3)); // год недели — год её четверга
  const week = Math.round((+monday - +isoWeekOneStart(year)) / WEEK_MS) + 1;
  return { year, week };
}

/** Сколько ISO-недель в году: 52 или 53. 28 декабря всегда в последней неделе. */
export function isoWeeksInYear(year: number): number {
  return isoWeekOf(mskMidnight(year, 11, 28)).week;
}

/** Понедельник 00:00 МСК недели `week` ISO-года `year` (без проверки диапазона). */
export function isoWeekStart(year: number, week: number): Date {
  return addDays(isoWeekOneStart(year), (week - 1) * 7);
}

/** «2026-W46» — адрес недели, в которую попадает `d`. */
export function formatIsoWeek(d: Date): string {
  const { year, week } = isoWeekOf(d);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** +N рабочих дней (пн–пт по Москве): срок заявки не выпадает на воскресенье (ux-reviewer, T05). */
export function addBusinessDays(d: Date, days: number): Date {
  let result = d;
  let left = days;
  while (left > 0) {
    result = addDays(result, 1);
    if (mskWeekday(result) <= 5) left -= 1;
  }
  return result;
}
