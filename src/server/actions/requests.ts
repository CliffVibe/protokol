"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStudent } from "@/server/auth/guards";
import {
  ratingCommentSchema,
  ratingSchema,
  requestHref,
  requestNumberSchema,
} from "@/server/services/request-rules";
import { cancelMyRequest, rateMyRequest, submitRequest } from "@/server/services/requests";

// Server Actions студента (T08). Первой инструкцией — requireStudent() (guards.test.ts).
// Кто студент — только из сессии; номер, тип и поля формы — ввод, всё через zod (S1, S5).

export type SubmitState = {
  fieldErrors?: Record<string, string>;
  /** Введённое — вернуть в поля после ошибки */
  values?: Record<string, string>;
};

const codeSchema = z.string().regex(/^[a-z_]{1,40}$/);
const clientKeySchema = z.uuid();
/** Поля формы — с префиксом f.: так их не спутать со служебными (type, clientKey, language) */
const FIELD_PREFIX = "f.";

export async function submitRequestAction(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const ctx = await requireStudent();
  const payload: Record<string, unknown> = {};
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith(FIELD_PREFIX) || typeof value !== "string") continue;
    const name = key.slice(FIELD_PREFIX.length);
    payload[name] = value;
    values[name] = value.slice(0, 1000);
  }
  const language = formData.get("language");
  if (typeof language === "string") values.language = language;

  const code = codeSchema.safeParse(formData.get("type"));
  const clientKey = clientKeySchema.safeParse(formData.get("clientKey"));
  if (!code.success || !clientKey.success)
    return { fieldErrors: { form: "Форма устарела — откройте её заново" }, values };

  const result = await submitRequest(ctx, {
    code: code.data,
    language,
    payload,
    clientKey: clientKey.data,
  });
  if (!result.ok) return { fieldErrors: result.fieldErrors, values };

  revalidatePath("/requests");
  revalidatePath("/");
  redirect(requestHref(result.number) as Route);
}

export type CancelState = { error?: string };

export async function cancelRequestAction(
  _prev: CancelState,
  formData: FormData,
): Promise<CancelState> {
  const ctx = await requireStudent();
  const number = requestNumberSchema.safeParse(formData.get("number"));
  // Чужая, несуществующая или уже принятая — одинаковый ответ: не подтверждаем существование
  const cancelled = number.success && (await cancelMyRequest(ctx, number.data));
  if (!cancelled) return { error: "Отменить нельзя: заявку уже взяли в работу." };
  revalidatePath("/requests");
  revalidatePath(requestHref(number.data));
  revalidatePath("/");
  return {};
}

export type RateState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: { rating?: string; comment?: string };
};

/**
 * Оценка решения заявки (T14, «Вы сказали — мы сделали»). Номер — ввод: репозиторий оценит только свою
 * заявку в статусе «Готова»/«Выдана» и только один раз.
 */
export async function rateRequestAction(_prev: RateState, formData: FormData): Promise<RateState> {
  const ctx = await requireStudent();
  const number = requestNumberSchema.safeParse(formData.get("number"));
  const rating = ratingSchema.safeParse(formData.get("rating"));
  const comment = ratingCommentSchema.safeParse(formData.get("comment") ?? "");
  if (!rating.success || !comment.success)
    return {
      fieldErrors: {
        rating: rating.success ? undefined : rating.error.issues[0]?.message,
        comment: comment.success ? undefined : comment.error.issues[0]?.message,
      },
    };
  const rated =
    number.success &&
    (await rateMyRequest(ctx, number.data, { rating: rating.data, comment: comment.data }));
  if (!rated) return { error: "Оценить нельзя: заявка уже оценена или ещё не готова." };
  revalidatePath(requestHref(number.data));
  revalidatePath("/staff");
  return { ok: true };
}
