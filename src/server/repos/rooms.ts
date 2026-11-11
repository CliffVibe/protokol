import "server-only";
import { db } from "@/server/db";
import type { StudentCtx } from "./auth";

// «Свободные аудитории» (T14): занятость аудиторий корпуса по расписанию. ИСКЛЮЧЕНИЕ из правила
// «данные — только свои»: запрос идёт по всем парам корпуса, но наружу отдаёт ТОЛЬКО номер аудитории
// и время — без групп, дисциплин, преподавателей и студентов. ctx — ради единообразия и чтобы вызывать
// мог только вошедший студент. Отменённая пара аудиторию не занимает.
export async function roomUsage(
  _ctx: StudentCtx,
  building: string,
  from: Date,
  to: Date,
): Promise<{ room: string; startsAt: Date; endsAt: Date }[]> {
  return db.lesson.findMany({
    where: { building, startsAt: { lt: to }, endsAt: { gt: from }, change: { not: "CANCELLED" } },
    select: { room: true, startsAt: true, endsAt: true },
  });
}
