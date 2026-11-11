import "server-only";
import { db } from "@/server/db";
import type { StaffCtx } from "./auth";

// Занятость аудиторий корпуса по расписанию (T14+): подбор свободной аудитории сотруднику при переносе пары.
// ИСКЛЮЧЕНИЕ из правила «данные — только свои»: запрос идёт по всем парам корпуса, но наружу отдаёт ТОЛЬКО
// номер аудитории и время — без групп, дисциплин, преподавателей и студентов. ctx — сотрудника: вызывать
// может только вошедший сотрудник. (Студенту «свободные аудитории в окно» сняты 11.11: аудитории закрыты.)
// Отменённая пара аудиторию не занимает; `exceptLessonId` — переносимая пара не мешает сама себе.
export async function roomUsage(
  _ctx: StaffCtx,
  building: string,
  from: Date,
  to: Date,
  exceptLessonId?: string,
): Promise<{ room: string; startsAt: Date; endsAt: Date }[]> {
  return db.lesson.findMany({
    where: {
      building,
      startsAt: { lt: to },
      endsAt: { gt: from },
      change: { not: "CANCELLED" },
      ...(exceptLessonId ? { id: { not: exceptLessonId } } : {}),
    },
    select: { room: true, startsAt: true, endsAt: true },
  });
}
