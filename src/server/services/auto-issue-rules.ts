// «Справка за 10 секунд» (T14+, идея второй оценки «глазами жюри» и № 3 топ-5 ресерча T14): типовую справку,
// которая целиком собирается из данных деканата, кабинет выдаёт сам — сразу, с PDF и QR-проверкой (S7).
// В очередь к сотруднику идут только исключения, и студент видит почему. Чистые функции: данные — снаружи.
//
// Что НИКОГДА не выдаётся автоматически:
// - свой текст в полях: он печатается в справке — его читает человек;
// - справки, где по правилам нужна подпись и печать (военкомат, посольство и остальные типы — не в списке);
// - студент с академической задолженностью: сотрудник проверяет, что статус не изменился;
// - больше AUTO_ISSUE_LIMIT справок одного вида за AUTO_ISSUE_WINDOW_DAYS дней — дальше проверяет человек.
// Справку, выданную кабинетом, сотрудник видит во вкладке «Выдал кабинет» и может отозвать — QR покажет «отозвана».

import { plural } from "@/lib/dates";

/** Типы, которые кабинет может выдать сам: справка об обучении — выписка из данных деканата. */
export const AUTO_ISSUE_TYPES = ["study_ru", "study_en"] as const;

/** Адресат, при котором справка типовая (пусто — то же самое). Сравнение без регистра и лишних пробелов. */
const STANDARD_ADDRESSEE: Record<(typeof AUTO_ISSUE_TYPES)[number], string> = {
  study_ru: "По месту требования",
  study_en: "To whom it may concern",
};

export const AUTO_ISSUE_LIMIT = 3;
export const AUTO_ISSUE_WINDOW_DAYS = 30;

export type AutoIssueDecision =
  /** Выдать сразу; payload — с подставленным стандартным адресатом */
  | { auto: true; payload: Record<string, string> }
  /** Тип, который кабинет выдаёт сам, но этот случай — исключение: причина студенту и сотруднику */
  | { auto: false; reason: string }
  /** Обычная заявка: этот тип всегда готовит сотрудник */
  | { auto: false; reason: null };

const isAutoType = (code: string): code is (typeof AUTO_ISSUE_TYPES)[number] =>
  (AUTO_ISSUE_TYPES as readonly string[]).includes(code);

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU");

export function autoIssueDecision(input: {
  typeCode: string;
  /** Значения полей после zod-схемы типа */
  payload: Record<string, string>;
  /** Долги прошлых сессий (summarizeStudy) */
  debts: number;
  /** Сколько справок этого вида кабинет уже выдал студенту за окно */
  recentAuto: number;
}): AutoIssueDecision {
  if (!isAutoType(input.typeCode)) return { auto: false, reason: null };
  const standard = STANDARD_ADDRESSEE[input.typeCode];
  const extra = Object.keys(input.payload).filter((k) => k !== "addressee" && input.payload[k]);
  const addressee = input.payload.addressee?.trim() ?? "";
  if (extra.length || (addressee && norm(addressee) !== norm(standard)))
    return {
      auto: false,
      reason: "свой адресат попадёт в текст справки — его нужно проверить",
    };
  if (input.debts > 0)
    return {
      auto: false,
      reason: "есть долг по сессии — данные для справки сверят вручную",
    };
  if (input.recentAuto >= AUTO_ISSUE_LIMIT)
    return {
      auto: false,
      reason: `за ${AUTO_ISSUE_WINDOW_DAYS} дней вы уже получили сразу ${AUTO_ISSUE_LIMIT} ${plural(AUTO_ISSUE_LIMIT, ["такую справку", "такие справки", "таких справок"])}`,
    };
  return { auto: true, payload: { ...input.payload, addressee: standard } };
}

/** Подсказка в форме до отправки — только у типов, которые кабинет может выдать сам. */
export function autoIssueHint(typeCode: string): string | null {
  if (!isAutoType(typeCode)) return null;
  // «Обычно»: при долге или после лимита справку проверит сотрудник (ux-reviewer — не обещать лишнего)
  return `Без своего адресата («${STANDARD_ADDRESSEE[typeCode]}») обычно выдаём сразу, без очереди. Свой адресат проверит сотрудник.`;
}

/** Комментарии событий автовыдачи — их видят студент (таймлайн) и сотрудник (история заявки). */
export const AUTO_EVENT_COMMENT = {
  ACCEPTED: "Принята автоматически: все данные — из базы деканата",
  ISSUED:
    "Выдана электронно: PDF с QR-кодом проверки. Бумажный оригинал с печатью — по просьбе в деканате",
} as const;

/** «Посмотрит сотрудник: …» — комментарий к «Подана», когда автовыдача не прошла. */
export const exceptionComment = (reason: string) => `Посмотрит сотрудник: ${reason}.`;
