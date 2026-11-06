import "server-only";
import { db } from "@/server/db";
import type { StudentCtx } from "./auth";

// Кто это: имя для приветствия и «адрес» для фильтра объявлений (факультет, курс, группа).
// Без номера зачётки и токена календаря — они здесь не нужны.

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
