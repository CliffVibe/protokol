"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireStudent } from "@/server/auth/guards";
import { rotateCalendarToken } from "@/server/repos/profile";

// Server Actions профиля (T11). Первой инструкцией — requireStudent() (guards.test.ts).
// Ввода нет: чей токен менять — только из сессии (S1).

export type RotateState = { ok?: boolean; error?: string };

/** «Перевыпустить ссылку» на календарь: новый токен 256 бит, старая ссылка сразу отвечает 404 (S7). */
export async function rotateCalendarTokenAction(): Promise<RotateState> {
  const ctx = await requireStudent();
  const ok = await rotateCalendarToken(ctx, randomBytes(32).toString("base64url"));
  if (!ok)
    return { error: "Не получилось перевыпустить ссылку. Обновите страницу и попробуйте снова" };
  revalidatePath("/profile");
  return { ok: true };
}
