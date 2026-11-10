import "server-only";
import { db } from "@/server/db";
import type { StaffCtx } from "./auth";

// Кто вошёл в кабинет сотрудника (T13): ФИО и коды своих факультетов — для шапки и блока «Профиль».
// Только свой сотрудник (ctx.staffId из сессии) и только открытые поля: без логина и хеша.
export async function staffIdentity(ctx: StaffCtx) {
  const [staff, faculties] = await Promise.all([
    db.staff.findUnique({ where: { id: ctx.staffId }, select: { fullName: true } }),
    db.faculty.findMany({
      where: { id: { in: ctx.facultyIds } },
      select: { id: true, code: true },
    }),
  ]);
  if (!staff) return null;
  // Порядок — как в профиле сотрудника («ФМО и МЭО»), а не по алфавиту кодов
  const code = new Map(faculties.map((f) => [f.id, f.code]));
  const facultyCodes = ctx.facultyIds.flatMap((id) => code.get(id) ?? []);
  return { fullName: staff.fullName, facultyCodes };
}
