"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import type { Route } from "next";
import { requireStaff } from "@/server/auth/guards";
import {
  faqEntryIdSchema,
  faqEntryFormSchema,
  readFaqEntryForm,
  REMOVED,
} from "@/server/services/faq-rules";
import { makeFaqDraft, removeFaqEntry, saveFaqEntry } from "@/server/services/faq-entries";
import { requestNumberSchema } from "@/server/services/request-rules";

// База знаний из заявок (T14+). Первой инструкцией — requireStaff() (guards.test.ts). Свой факультет
// проверяет репозиторий в каждом запросе; чужое → 404 без различий.

export type MakeDraftState = { error?: string };

/** «Сделать ответом помощника» из карточки заявки → редактор черновика. */
export async function makeFaqDraftAction(
  _prev: MakeDraftState,
  formData: FormData,
): Promise<MakeDraftState> {
  const ctx = await requireStaff();
  const number = requestNumberSchema.safeParse(formData.get("number"));
  if (!number.success) return { error: "Не получилось — обновите страницу" };
  const r = await makeFaqDraft(ctx, number.data);
  if (r === "not_found") notFound();
  if (r === "no_comment")
    return {
      error: "В заявке нет вашего ответа студенту — напишите комментарий при смене статуса",
    };
  revalidatePath("/staff/answers");
  const removed = r.removed.length ? `?removed=${r.removed.join(",")}` : "";
  redirect(`/staff/answers/${r.id}${removed}` as Route);
}

export type FaqEntryState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: { title?: string; keywords?: string; body?: string };
  /** React сбрасывает форму после действия — возвращаем введённое */
  values?: { title: string; keywords: string; body: string };
};

export async function saveFaqEntryAction(
  _prev: FaqEntryState,
  formData: FormData,
): Promise<FaqEntryState> {
  const ctx = await requireStaff();
  const raw = readFaqEntryForm(formData);
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const values = {
    title: text(raw.title, 200),
    keywords: text(raw.keywords, 400),
    body: text(raw.body, 2500),
  };
  const parsed = faqEntryFormSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: NonNullable<FaqEntryState["fieldErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === "title" || key === "keywords" || key === "body")
        fieldErrors[key] ??= issue.message;
      else return { error: "Не получилось — обновите страницу", values };
    }
    return { fieldErrors, values };
  }
  const r = await saveFaqEntry(ctx, parsed.data, new Date());
  if (r === "not_found") notFound();
  if (r !== "ok") {
    const what = r.personal.map((k) => REMOVED[k]).join(", ");
    // Ошибка — у поля, где личное: его и исправлять (ux-reviewer, T14+)
    return {
      fieldErrors: {
        [r.field]: `Похоже, тут остались личные данные: ${what}. Уберите их — ответ увидят все студенты`,
      },
      values,
    };
  }
  revalidatePath("/staff/answers");
  revalidatePath(`/staff/answers/${parsed.data.id}`);
  const message =
    parsed.data.intent === "publish"
      ? "Опубликовано: помощник уже отвечает этим текстом студентам."
      : parsed.data.intent === "unpublish"
        ? "Снято с публикации: помощник больше не отвечает этим текстом."
        : "Сохранено.";
  return { ok: true, message, values };
}

export type DeleteFaqState = { ok?: boolean; error?: string };

/** Удалить черновик или ответ (DialogForm с подтверждением) → к списку. */
export async function deleteFaqEntryAction(
  _prev: DeleteFaqState,
  formData: FormData,
): Promise<DeleteFaqState> {
  const ctx = await requireStaff();
  const id = faqEntryIdSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "Не получилось — обновите страницу" };
  if (!(await removeFaqEntry(ctx, id.data))) notFound();
  revalidatePath("/staff/answers");
  redirect("/staff/answers" as Route);
}
