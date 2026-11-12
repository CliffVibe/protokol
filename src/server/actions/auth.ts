"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIpFrom } from "@/lib/client-ip";
import { homeFor, requireUser } from "@/server/auth/guards";
import { createSession, destroyAllSessions, destroySession } from "@/server/auth/session";
import { LOGIN_MAX } from "@/server/auth/schemas";
import { authenticate, authenticateDemo, type FieldErrors } from "@/server/services/auth";

// Server Actions входа и выхода. login / demoLogin / logout работают без сессии — это записано
// в списке исключений tests/unit/guards.test.ts; logoutEverywhere требует вошедшего пользователя.

export type LoginState = {
  error?: "invalid" | "locked";
  fieldErrors?: FieldErrors;
  /** Введённый логин — вернуть в поле после ошибки (пароль не возвращаем никогда). */
  login?: string;
};

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const rawLogin = formData.get("login");
  const ip = clientIpFrom((await headers()).get("x-forwarded-for"));
  const result = await authenticate({ login: rawLogin, password: formData.get("password") }, ip);

  if (!result.ok) {
    const login = typeof rawLogin === "string" ? rawLogin.slice(0, LOGIN_MAX) : "";
    if (result.reason === "fields") return { fieldErrors: result.fieldErrors, login };
    return { error: result.reason, login };
  }

  await createSession(result.userId);
  redirect(homeFor(result.role));
}

/** «Войти как…» — только при DEMO_MODE=1 и только для фиксированного списка демо-логинов. */
export async function demoLogin(formData: FormData): Promise<void> {
  const ip = clientIpFrom((await headers()).get("x-forwarded-for"));
  const result = await authenticateDemo({ login: formData.get("login") }, ip);
  // #demo-title — сообщение стоит в демо-блоке, а он на телефоне ниже формы (ux-reviewer, T14)
  if (!result.ok) redirect(result.reason === "wait" ? "/login?demo=wait#demo-title" : "/login");
  await createSession(result.userId);
  redirect(homeFor(result.role));
}

/** Выход: сессия удаляется из БД. Без сессии — просто на /login. */
export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}

/** «Выйти на всех устройствах» — все сессии текущего пользователя. */
export async function logoutEverywhere(): Promise<void> {
  const user = await requireUser();
  await destroyAllSessions(user.userId);
  redirect("/login");
}
