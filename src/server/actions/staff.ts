"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth/guards";
import { plural } from "@/lib/dates";
import { batchDone } from "@/lib/reply-templates";
import {
  batchFormSchema,
  commentSchema,
  readBatchForm,
  rejectReasonSchema,
  requestNumberSchema,
  staffRequestHref,
  statusSchema,
} from "@/server/services/request-rules";
import { draftReply } from "@/server/services/ai/draft";
import { batchSetStatus, revokeCertificate, setStatus } from "@/server/services/requests";

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

export type BatchState = { ok?: boolean; message?: string; error?: string };

/**
 * Пакетная обработка очереди (T14+): несколько заявок — один переход и один шаблон ответа. Номера и
 * «статус, который видел сотрудник» — из формы, но факультет, переход и актуальность проверяет сервер
 * по каждой заявке. Отклонить пачкой нельзя (схема не пропустит REJECTED).
 */
export async function batchStatusAction(
  _prev: BatchState,
  formData: FormData,
): Promise<BatchState> {
  const ctx = await requireStaff();
  const parsed = batchFormSchema.safeParse(readBatchForm(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const r = await batchSetStatus(ctx, parsed.data, new Date());
  revalidatePath("/staff");
  // Шаг касается только заявок со статусом, из которого он возможен; остальные выбранные не трогаем
  const total = parsed.data.picks.length - r.ignored;
  if (!total) return { error: "Этот шаг не подходит ни к одной из выбранных заявок" };
  const parts = [
    `${batchDone(parsed.data.to, r.done)}${r.done < total ? ` из ${total}` : ""} — студенты получили уведомления.`,
  ];
  if (r.stale)
    parts.push(
      `${r.stale} ${plural(r.stale, ["заявку", "заявки", "заявок"])} уже изменил кто-то другой — проверьте их в списке.`,
    );
  if (r.skipped)
    parts.push(
      `${r.skipped} ${plural(r.skipped, ["заявка не найдена", "заявки не найдены", "заявок не найдено"])} — проверьте список.`,
    );
  // Ничего не изменилось — это ошибка, а не «готово 0 из 3»
  if (!r.done)
    return { error: parts.slice(1).join(" ") || "Ничего не изменилось — проверьте список" };
  return { ok: true, message: parts.join(" ") };
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
