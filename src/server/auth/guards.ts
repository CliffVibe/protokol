import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { loadStaffCtx, loadStudentCtx, type StaffCtx, type StudentCtx } from "@/server/repos/auth";
import type { SessionUser } from "@/server/services/sessions";
import { getSession } from "./session";

// Проверка доступа (CLAUDE.md → «Железные правила», docs/05-security.md → S1).
// Вызывается в КАЖДОЙ page, Server Action и route handler — не в layout: layout не перерисовывается
// при клиентской навигации и рендерится параллельно со страницей. Это держит tests/unit/guards.test.ts.
// cache(): в рамках одного рендера БД спрашиваем один раз.

export type { StaffCtx, StudentCtx };

/** Любой вошедший пользователь; иначе — на /login. */
export const requireUser = cache(async (): Promise<SessionUser> => {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
});

/** Студент → ctx { userId, studentId, groupIds, languageGroupIds }. Сотрудника отправляем в его кабинет. */
export const requireStudent = cache(async (): Promise<StudentCtx> => {
  const session = await requireUser();
  if (session.role !== "STUDENT") redirect("/staff");
  const ctx = await loadStudentCtx(session.userId);
  if (!ctx) notFound();
  return ctx;
});

/**
 * Сотрудник → ctx { userId, staffId, facultyIds }. Студента — в его кабинет (тест 3 в 05: «редирект/404»):
 * notFound() рисовался бы внутри оболочки сотрудника и показывал бы её шапку.
 */
export const requireStaff = cache(async (): Promise<StaffCtx> => {
  const session = await requireUser();
  if (session.role !== "STAFF") redirect("/");
  const ctx = await loadStaffCtx(session.userId);
  if (!ctx) notFound();
  return ctx;
});

/** Куда вести после входа. */
export function homeFor(role: SessionUser["role"]): "/" | "/staff" {
  return role === "STAFF" ? "/staff" : "/";
}
