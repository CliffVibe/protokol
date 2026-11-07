import "server-only";
import { db } from "@/server/db";

// Подписка на расписание по токену (T11, S7) — исключение из правила «каждая функция репозитория
// получает ctx», как repos/verify.ts: календарь (Google, iPhone) перечитывает ссылку сам, без входа.
// Доступ даёт сам токен — 32 случайных байта (256 бит), перебором не найти; перевыпуск — из профиля.
// Студента ищем только ради его групп: наружу не выходит НИЧЕГО о нём (ни ФИО, ни группы, ни зачётки,
// ни оценок) — только пары, как в расписании.

export async function lessonsByCalendarToken(token: string, from: Date, to: Date) {
  const s = await db.student.findUnique({
    where: { calendarToken: token },
    select: { groupId: true, languageGroups: { select: { languageGroupId: true } } },
  });
  if (!s) return null;
  return db.lesson.findMany({
    where: {
      startsAt: { gte: from, lt: to },
      OR: [
        { groupId: s.groupId },
        { languageGroupId: { in: s.languageGroups.map((l) => l.languageGroupId) } },
      ],
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      kind: true,
      startsAt: true,
      endsAt: true,
      building: true,
      room: true,
      change: true,
      changeNote: true,
      originalStartsAt: true,
      discipline: { select: { name: true } },
      teacher: { select: { fullName: true } },
    },
  });
}

export type CalendarLesson = NonNullable<
  Awaited<ReturnType<typeof lessonsByCalendarToken>>
>[number];
