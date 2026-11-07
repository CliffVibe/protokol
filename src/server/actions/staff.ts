"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/server/auth/guards";
import { resetDemoData } from "@/server/repos/demo";
import {
  commentSchema,
  rejectReasonSchema,
  requestNumberSchema,
  staffRequestHref,
  statusSchema,
} from "@/server/services/request-rules";
import { draftReply } from "@/server/services/ai/draft";
import { revokeCertificate, setStatus } from "@/server/services/requests";

// Server Actions сотрудника (T08). Первой инструкцией — requireStaff() (guards.test.ts).
// Факультет заявки, разрешённый переход и «статус всё ещё from» проверяет сервер, а не скрытая кнопка.

export type StatusState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: { reason?: string; comment?: string };
};

export async function setRequestStatusAction(
  _prev: StatusState,
  formData: FormData,
): Promise<StatusState> {
  const ctx = await requireStaff();
  const number = requestNumberSchema.safeParse(formData.get("number"));
  const from = statusSchema.safeParse(formData.get("from"));
  const to = statusSchema.safeParse(formData.get("to"));
  if (!number.success || !from.success || !to.success)
    return { error: "Не получилось — обновите страницу" };

  let comment: string | null;
  if (to.data === "REJECTED") {
    const reason = rejectReasonSchema.safeParse(formData.get("reason") ?? "");
    if (!reason.success) return { fieldErrors: { reason: reason.error.issues[0]!.message } };
    comment = reason.data;
  } else {
    const c = commentSchema.safeParse(formData.get("comment") ?? "");
    if (!c.success) return { fieldErrors: { comment: c.error.issues[0]!.message } };
    comment = c.data;
  }

  const result = await setStatus(ctx, {
    number: number.data,
    from: from.data,
    to: to.data,
    comment,
  });
  if (result === "not_found") notFound();
  if (result === "forbidden_transition")
    return { error: "Такой шаг для этой заявки недоступен — обновите страницу" };
  if (result === "conflict")
    return { error: "Статус уже изменили — обновите страницу, чтобы увидеть актуальный" };

  revalidatePath("/staff");
  revalidatePath(staffRequestHref(number.data));
  return { ok: true };
}

export type RevokeState = { ok?: boolean; error?: string; fieldErrors?: { reason?: string } };

/** Отозвать выданную справку (T10). QR в скачанных копиях начнёт показывать «Отозвана». */
export async function revokeDocumentAction(
  _prev: RevokeState,
  formData: FormData,
): Promise<RevokeState> {
  const ctx = await requireStaff();
  const number = requestNumberSchema.safeParse(formData.get("number"));
  if (!number.success) return { error: "Не получилось — обновите страницу" };
  const reason = rejectReasonSchema.safeParse(formData.get("reason") ?? "");
  if (!reason.success) return { fieldErrors: { reason: reason.error.issues[0]!.message } };

  const result = await revokeCertificate(ctx, { number: number.data, reason: reason.data });
  if (result === "not_found") notFound();
  if (result === "conflict") return { error: "Справку уже отозвали — обновите страницу" };

  revalidatePath(staffRequestHref(number.data));
  return { ok: true };
}

export type ResetState = { error?: string };

/**
 * «Сбросить демо» — только сотрудник и только при DEMO_MODE=1. Пересев очищает и сессии,
 * поэтому дальше — на вход.
 */
export async function resetDemoAction(): Promise<ResetState> {
  const ctx = await requireStaff();
  if (process.env.DEMO_MODE !== "1") notFound();
  const result = await resetDemoData(ctx);
  if (!result.ok)
    return {
      error: `Демо сбросили совсем недавно — повторить можно через ${result.retryInMinutes} мин.`,
    };
  redirect("/login");
}

export type DraftState = { text?: string; notice?: string; error?: string };

/**
 * «Подготовить черновик» (T12): текст комментария к следующему шагу заявки. Ничего не меняет —
 * только возвращает текст; отправляет сотрудник сам кнопкой перехода (setRequestStatusAction).
 * Чужой факультет или битый номер — та же «не найдена», без подробностей.
 */
export async function draftReplyAction(number: unknown, to: unknown): Promise<DraftState> {
  const ctx = await requireStaff();
  const n = requestNumberSchema.safeParse(number);
  const t = statusSchema.safeParse(to);
  if (!n.success || !t.success) return { error: "Не получилось — обновите страницу" };
  const result = await draftReply(ctx, n.data, t.data);
  if (!result.ok) {
    return {
      error:
        result.reason === "not_found"
          ? "Заявка не найдена — обновите страницу"
          : "Статус уже изменили — обновите страницу",
    };
  }
  return { text: result.text, ...(result.notice ? { notice: result.notice } : {}) };
}
