// zod-схемы входа (S5). Ограничения длины — из security-ревью T02: argon2 на мегабайтном пароле —
// дешёвая DoS, поэтому длиннее 128 символов пароль даже не хешируем.
import { z } from "zod";
import { DEMO_LOGINS } from "@/lib/demo-accounts";

export const LOGIN_MAX = 64;
export const PASSWORD_MAX = 128;

/** Пустые поля — ошибка конкретного поля; слишком длинные — общая «Неверный логин или пароль». */
export const loginFieldsSchema = z.object({
  login: z.string().trim().min(1, "Введите логин"),
  password: z.string().min(1, "Введите пароль"),
});

export const loginLimitsSchema = z.object({
  login: z.string().max(LOGIN_MAX),
  password: z.string().max(PASSWORD_MAX),
});

export const demoLoginSchema = z.object({ login: z.enum(DEMO_LOGINS) });
