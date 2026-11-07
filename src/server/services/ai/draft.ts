import "server-only";
import type { RequestStatus } from "@/generated/prisma/client";
import { REQUEST_STATUS } from "@/components/now/labels";
import { formatDayMonth } from "@/lib/dates";
import { mskStartOfDay } from "@/lib/msk";
import type { StaffCtx } from "@/server/auth/guards";
import { reserveAiCall, type AiCallSlot } from "@/server/repos/assistant";
import { staffRequestByNumber } from "@/server/repos/staff-requests";
import { canTransition, dueDate, parseFields } from "@/server/services/request-rules";
import { defaultProvider } from "./assistant";
import { GigaChatError } from "./gigachat";
import type { AiProvider } from "./provider";

// «Черновик ответа» сотруднику (T12, расширение 01-concept H). Модель ничего не меняет: черновик
// попадает в поле комментария, сотрудник правит его и сам нажимает кнопку перехода (Server Action
// setRequestStatusAction проверяет всё заново). Заявка — только своего факультета (фильтр в репозитории).
// Во внешний сервис уходит минимум: тип справки, статусы, срок и ПОДПИСИ полей — без значений и без ФИО.

export const MAX_DRAFT = 500;

/** due — ожидаемая дата или null, если срок уже прошёл: прошедшую дату не обещаем (скриншот T12) */
const TEMPLATE: Partial<Record<RequestStatus, (due: string | null) => string>> = {
  ACCEPTED: (due) =>
    due
      ? `Здравствуйте! Заявку приняли. Подготовим справку в срок — до ${due}. Если что-то понадобится уточнить, напишем здесь.`
      : "Здравствуйте! Заявку приняли. Простите за задержку — подготовим справку в ближайшие дни. Если что-то понадобится уточнить, напишем здесь.",
  IN_PROGRESS: (due) =>
    due
      ? "Взяли заявку в работу. Сообщим, как только справка будет готова."
      : "Взяли заявку в работу. Простите за задержку — сообщим, как только справка будет готова.",
  READY: () =>
    "Справка готова. Электронную версию можно скачать в заявке, бумажный оригинал — забрать в деканате в часы приёма.",
  ISSUED: () =>
    "Справка выдана. Если понадобится ещё экземпляр, оформите новую заявку — это займёт пару минут.",
};

export type DraftResult =
  | { ok: true; text: string; mode: "ai" | "template"; notice?: string }
  | { ok: false; reason: "not_found" | "forbidden_transition" };

export type DraftDeps = {
  provider?: AiProvider | null;
  reserve?: (ctx: StaffCtx, now: Date) => Promise<AiCallSlot>;
  now?: Date;
};

export function draftPrompt(input: {
  title: string;
  from: RequestStatus;
  to: RequestStatus;
  slaDays: number;
  /** null — срок уже прошёл */
  due: string | null;
  fieldLabels: string[];
}) {
  return [
    {
      role: "system" as const,
      content:
        "Ты помогаешь сотруднику деканата написать комментарий студенту к смене статуса его заявки на справку. " +
        "1–3 коротких предложения, по-русски, на «вы», вежливо и по делу. Не выдумывай фактов, имён, телефонов и адресов; " +
        "дату называй только ту, что дана. Ответ — только текст комментария, без кавычек и подписи.",
    },
    {
      role: "user" as const,
      content: [
        `Справка: ${input.title}.`,
        `Статус был: ${REQUEST_STATUS[input.from].label}. Станет: ${REQUEST_STATUS[input.to].label}.`,
        input.due
          ? `Срок по регламенту: ${input.slaDays} раб. дн., ожидаемая дата — ${input.due}.`
          : `Срок по регламенту (${input.slaDays} раб. дн.) уже прошёл: извинись за задержку, новой даты не называй.`,
        input.fieldLabels.length ? `Студент заполнил поля: ${input.fieldLabels.join(", ")}.` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
}

export async function draftReply(
  ctx: StaffCtx,
  number: string,
  to: RequestStatus,
  deps: DraftDeps = {},
): Promise<DraftResult> {
  const now = deps.now ?? new Date();
  const r = await staffRequestByNumber(ctx, number);
  if (!r) return { ok: false, reason: "not_found" };
  if (to === "REJECTED" || !canTransition(r.status, to)) {
    return { ok: false, reason: "forbidden_transition" };
  }
  const dueAt = dueDate(r.createdAt, r.type.slaDays);
  const due = dueAt >= mskStartOfDay(now) ? formatDayMonth(dueAt) : null;
  const template = TEMPLATE[to]?.(due) ?? "";

  const provider = deps.provider === undefined ? defaultProvider() : deps.provider;
  if (!provider) return { ok: true, text: template, mode: "template" };

  const slot = await (deps.reserve ?? reserveAiCall)(ctx, now);
  if (!slot.ok) {
    return {
      ok: true,
      text: template,
      mode: "template",
      notice: "Лимит ИИ — 20 запросов в час. Подставили шаблон.",
    };
  }
  const messages = draftPrompt({
    title: r.type.title,
    from: r.status,
    to,
    slaDays: r.type.slaDays,
    due,
    fieldLabels: (parseFields(r.type.fields) ?? []).map((f) => f.label),
  });
  try {
    let text = "";
    for await (const piece of provider.stream(messages, AbortSignal.timeout(20_000))) {
      text += piece;
      if (text.length > MAX_DRAFT * 2) break;
    }
    text = text
      .trim()
      .replace(/^["«]|["»]$/g, "")
      .slice(0, MAX_DRAFT)
      .trim();
    if (text) return { ok: true, text, mode: "ai" };
  } catch (e) {
    const code = e instanceof GigaChatError ? e.code : "error";
    console.info(JSON.stringify({ event: "draft", mode: "ai_error", code }));
  }
  return {
    ok: true,
    text: template,
    mode: "template",
    notice: "ИИ сейчас недоступен. Подставили шаблон.",
  };
}
