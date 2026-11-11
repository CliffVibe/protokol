import "server-only";
import type { StaffCtx } from "@/server/auth/guards";
import {
  createFaqDraft,
  deleteFaqEntry,
  faqEntriesOf,
  faqEntryOf,
  requestForFaq,
  updateFaqEntry,
} from "@/server/repos/faq-entries";
import {
  draftFromRequest,
  personalField,
  personalLeft,
  type FaqEntryForm,
  type RemovedKind,
} from "./faq-rules";

// База знаний из заявок (T14+), сторона сотрудника. Данные — только через repos (свои факультеты, S1);
// обезличивание и проверки — чистые функции faq-rules.ts.

/** «Сделать ответом помощника»: черновик из последнего комментария сотрудника, уже обезличенный. */
export async function makeFaqDraft(
  ctx: StaffCtx,
  number: string,
): Promise<{ id: string; removed: RemovedKind[] } | "not_found" | "no_comment"> {
  const r = await requestForFaq(ctx, number);
  if (!r) return "not_found";
  if (r.faqEntry) return { id: r.faqEntry.id, removed: [] };
  const comment = r.events[0]?.comment;
  if (!comment) return "no_comment";
  const draft = draftFromRequest({ typeTitle: r.type.title, comment, student: r.student });
  const id = await createFaqDraft(ctx, {
    facultyId: r.student.group.program.facultyId,
    sourceRequestId: r.id,
    title: draft.title,
    keywords: draft.keywords,
    body: draft.body,
  });
  return { id, removed: draft.removed };
}

export const listFaqEntries = (ctx: StaffCtx) => faqEntriesOf(ctx);
export const getFaqEntry = (ctx: StaffCtx, id: string) => faqEntryOf(ctx, id);

export type SaveResult =
  "ok" | "not_found" | { personal: RemovedKind[]; field: "title" | "keywords" | "body" };

/**
 * Сохранить, опубликовать или снять. Публикация — только если в тексте не осталось личного: шаблоны
 * (номера, контакты, ссылки) и ФИО студента заявки-источника (сотрудник мог вернуть его, правя текст).
 */
export async function saveFaqEntry(ctx: StaffCtx, f: FaqEntryForm, now: Date): Promise<SaveResult> {
  const entry = await faqEntryOf(ctx, f.id);
  if (!entry) return "not_found";
  const published = f.intent === "publish" || (f.intent === "save" && entry.published);
  if (published) {
    const person = entry.sourceRequest?.student ?? null;
    const left = personalLeft(f, person);
    if (left.length) return { personal: left, field: personalField(f, person) ?? "body" };
  }
  const ok = await updateFaqEntry(ctx, f.id, { ...f, published }, now);
  return ok ? "ok" : "not_found";
}

export async function removeFaqEntry(ctx: StaffCtx, id: string): Promise<boolean> {
  return deleteFaqEntry(ctx, id);
}
