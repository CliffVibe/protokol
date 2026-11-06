// Разбор ?week=YYYY-Www для /schedule (T06, S5: любой ввод — через zod).
// Битое значение — не ошибка: показываем текущую неделю, а не 500 и не редирект.
import { z } from "zod";
import { isoWeekStart, isoWeeksInYear, mskYear } from "./msk";

const WEEK_PARAM = /^(\d{4})-W(\d{2})$/;

/** Насколько далеко от текущего года можно уйти: дальше — явно не расписание, а подбор адресов. */
const YEAR_SPAN = 1;

export const weekParamSchema = z
  .string()
  .regex(WEEK_PARAM)
  .transform((s) => {
    const [, y, w] = WEEK_PARAM.exec(s)!;
    return { year: Number(y), week: Number(w) };
  })
  .refine(({ year, week }) => week >= 1 && week <= isoWeeksInYear(year));

/**
 * Понедельник недели из параметра `week` или `null`, если параметра нет или он битый
 * (массив, мусор, W00, W54, W53 в году без неё, год дальше ±1 от текущего).
 */
export function parseWeekParam(raw: unknown, now: Date): Date | null {
  const parsed = weekParamSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { year, week } = parsed.data;
  if (Math.abs(year - mskYear(now)) > YEAR_SPAN) return null;
  return isoWeekStart(year, week);
}
