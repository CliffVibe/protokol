// Разбор параметров «Успеваемости» (T07, S5: любой ввод — через zod).
// ?semester=N — только семестр, который есть у студента; иначе текущий (не 500, не редирект).
// [disciplineId] — формат id; мусор → 404 без запроса в БД. Чей это id — решает репозиторий (S1).
import { z } from "zod";

export const semesterParamSchema = z
  .string()
  .regex(/^\d{1,2}$/)
  .transform(Number);

/** Семестр из ?semester=, если он есть среди `available`; иначе `null` (показываем текущий). */
export function parseSemesterParam(raw: unknown, available: number[]): number | null {
  const parsed = semesterParamSchema.safeParse(raw);
  return parsed.success && available.includes(parsed.data) ? parsed.data : null;
}

export const disciplineIdSchema = z.string().regex(/^[a-z0-9-]{1,64}$/);
