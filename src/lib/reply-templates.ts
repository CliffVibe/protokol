// Шаблоны ответа студентам для пакетной обработки (T14+, «макросы» из ресерча деканату).
// Клиент выбирает шаблон по id и показывает его с метками; текст для каждой заявки собирает сервер —
// подставляет название справки, срок по SLA и часы выдачи. Свободного текста в пачке нет.
import { formatRelativeDay, plural } from "./dates";
import { PICKUP_HOURS } from "./dean-office";
import { mskDateKey } from "./msk";

/** Куда пачкой можно перевести: только вперёд. Отклонение — по одной: причина у каждой своя. */
export const BATCH_TARGETS = ["ACCEPTED", "IN_PROGRESS", "READY", "ISSUED"] as const;
export type BatchTarget = (typeof BATCH_TARGETS)[number];

/** Подпись действия над несколькими заявками — «Отметить готовыми», а не «готовой». */
export const BATCH_ACTION_LABEL: Record<BatchTarget, string> = {
  ACCEPTED: "Принять",
  IN_PROGRESS: "Взять в работу",
  READY: "Отметить готовыми",
  ISSUED: "Выдать справки",
};

const zayavki = (n: number) => `${n} ${plural(n, ["заявку", "заявки", "заявок"])}`;
const spravki = (n: number) => `${n} ${plural(n, ["справку", "справки", "справок"])}`;

/** Кнопка и вопрос подтверждения: «Принять 2 заявки», «Выдать 5 справок» (ux-reviewer, T14+). */
export function batchPhrase(to: BatchTarget, n: number): string {
  switch (to) {
    case "ACCEPTED":
      return `Принять ${zayavki(n)}`;
    case "IN_PROGRESS":
      return `Взять в работу ${zayavki(n)}`;
    case "READY":
      return `Отметить ${n === 1 ? "готовой" : "готовыми"} ${zayavki(n)}`;
    case "ISSUED":
      return `Выдать ${spravki(n)}`;
  }
}

/** Итог: что сделано — «Приняли 2 заявки», а не «Готово: 2 из 2». */
export function batchDone(to: BatchTarget, n: number): string {
  switch (to) {
    case "ACCEPTED":
      return `Приняли ${zayavki(n)}`;
    case "IN_PROGRESS":
      return `Взяли в работу ${zayavki(n)}`;
    case "READY":
      return `Отметили ${n === 1 ? "готовой" : "готовыми"} ${zayavki(n)}`;
    case "ISSUED":
      return `Выдали ${spravki(n)}`;
  }
}

export type ReplyTemplate = { id: string; to: BatchTarget; label: string; text: string };

export const REPLY_TEMPLATES = [
  {
    id: "accept-due",
    to: "ACCEPTED",
    label: "Приняли, срок",
    text: "Приняли заявку на справку «{справка}». Срок готовности — {срок}.",
  },
  { id: "accept-short", to: "ACCEPTED", label: "Приняли", text: "Приняли, работаем." },
  {
    id: "work-due",
    to: "IN_PROGRESS",
    label: "В работе, срок",
    text: "Взяли в работу. Справка «{справка}» будет готова — {срок}.",
  },
  {
    id: "ready-pickup",
    to: "READY",
    label: "Готова, где забрать",
    text: "Справка «{справка}» готова. Забрать в деканате: {часы}. Электронная копия с QR-кодом — уже в кабинете.",
  },
  { id: "ready-short", to: "READY", label: "Готова", text: "Справка готова." },
  {
    id: "issued-thanks",
    to: "ISSUED",
    label: "Выдана, оцените",
    text: "Справку выдали. Оцените, пожалуйста, работу деканата в заявке — по отзывам мы улучшаем сервис.",
  },
] as const satisfies readonly ReplyTemplate[];

export type ReplyTemplateId = (typeof REPLY_TEMPLATES)[number]["id"];

export const templatesFor = (to: BatchTarget): ReplyTemplate[] =>
  REPLY_TEMPLATES.filter((t) => t.to === to);

/** Текст для одной заявки. Срок прошёл — не пишем дату из прошлого. */
export function renderTemplate(
  t: Pick<ReplyTemplate, "text">,
  r: { typeTitle: string; dueAt: Date; now: Date },
): string {
  // Сравниваем дни по Москве (YYYY-MM-DD сравнимы строкой): срок сегодня — «сегодня», а не «прошёл»
  const due =
    mskDateKey(r.dueAt) < mskDateKey(r.now)
      ? "в ближайший рабочий день"
      : formatRelativeDay(r.dueAt, r.now);
  return t.text
    .replaceAll("{справка}", r.typeTitle)
    .replaceAll("{срок}", due)
    .replaceAll("{часы}", PICKUP_HOURS);
}

/** Как шаблон выглядит до подстановки — для подтверждения: «‹справка›», «‹срок›». */
export const previewTemplate = (t: Pick<ReplyTemplate, "text">) =>
  t.text
    // «{справка}» в кавычках → метка без кавычек: «‹название справки›» читалось как опечатка
    .replaceAll("«{справка}»", "‹название справки›")
    .replaceAll("{справка}", "‹название справки›")
    .replaceAll("{срок}", "‹срок по заявке›")
    .replaceAll("{часы}", PICKUP_HOURS);
