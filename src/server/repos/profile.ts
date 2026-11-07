import "server-only";
import { db } from "@/server/db";
import type { StudentCtx } from "./auth";

// Кто это: имя для приветствия и «адрес» для фильтра объявлений (факультет, курс, группа).
// readerOf — без номера зачётки и токена календаря: они здесь не нужны.

export async function readerOf(ctx: StudentCtx) {
  const s = await db.student.findUnique({
    where: { id: ctx.studentId },
    select: {
      firstName: true,
      group: {
        select: {
          name: true,
          course: true,
          program: { select: { faculty: { select: { code: true } } } },
        },
      },
    },
  });
  if (!s) return null;
  return {
    firstName: s.firstName,
    groupName: s.group.name,
    course: s.group.course,
    facultyCode: s.group.program.faculty.code,
  };
}

/**
 * Профиль (T11): кто я и ссылка на подписку. Явный select — без номера зачётки и пользователя.
 * calendarToken отдаём только самому студенту: из него собирается его личная ссылка .ics.
 */
export async function profileOf(ctx: StudentCtx) {
  return db.student.findUnique({
    where: { id: ctx.studentId },
    select: {
      lastName: true,
      firstName: true,
      middleName: true,
      calendarToken: true,
      group: {
        select: {
          name: true,
          course: true,
          program: { select: { name: true, faculty: { select: { name: true } } } },
        },
      },
      languageGroups: {
        select: { languageGroup: { select: { language: true, level: true, name: true } } },
        orderBy: { languageGroup: { name: "asc" } },
      },
    },
  });
}

/**
 * Перевыпуск ссылки на календарь (T11, S7): старая перестаёт работать сразу. Только свой студент —
 * id из ctx; count === 1 — иначе студента нет (не должно случаться после requireStudent).
 */
export async function rotateCalendarToken(ctx: StudentCtx, token: string): Promise<boolean> {
  const { count } = await db.student.updateMany({
    where: { id: ctx.studentId },
    data: { calendarToken: token },
  });
  return count === 1;
}
