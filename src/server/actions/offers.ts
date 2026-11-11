"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStudent } from "@/server/auth/guards";
import { OFFER_CODES } from "@/server/services/offer-rules";
import { acceptOffer, dismissMyOffer } from "@/server/services/offers";
import { requestHref } from "@/server/services/request-rules";

// «Вам положено» (T14). Первой инструкцией — requireStudent() (guards.test.ts). Код предложения — ввод:
// только из списка правил; подходит ли студент — решает сервер (services/offers.ts), а не кнопка.

export type OfferState = { error?: string };

const codeSchema = z.enum(OFFER_CODES);
const clientKeySchema = z.uuid();

export async function acceptOfferAction(
  _prev: OfferState,
  formData: FormData,
): Promise<OfferState> {
  const ctx = await requireStudent();
  const code = codeSchema.safeParse(formData.get("code"));
  const clientKey = clientKeySchema.safeParse(formData.get("clientKey"));
  if (!code.success || !clientKey.success)
    return { error: "Предложение устарело — обновите страницу" };
  const result = await acceptOffer(ctx, code.data, clientKey.data);
  if (!result.ok) return { error: "Предложение больше не действует — обновите страницу" };
  revalidatePath("/");
  revalidatePath("/requests");
  redirect(requestHref(result.number) as Route);
}

export async function dismissOfferAction(
  _prev: OfferState,
  formData: FormData,
): Promise<OfferState> {
  const ctx = await requireStudent();
  const code = codeSchema.safeParse(formData.get("code"));
  if (!code.success) return { error: "Предложение устарело — обновите страницу" };
  await dismissMyOffer(ctx, code.data);
  revalidatePath("/");
  return {};
}
