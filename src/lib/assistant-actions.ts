// Кнопки-действия помощника (T12, S8 «ответ модели не исполняется»). Модель не пишет адреса —
// только id из этого списка в последней строке «ДЕЙСТВИЯ: a, b». Сервер превращает id в маршрут,
// неизвестное отбрасывает. Кнопка — обычная ссылка: студент нажимает сам, страница проверяет всё заново.
// Чистые функции без БД (юнит-тесты — tests/unit/assistant-actions.test.ts).
import type { Route } from "next";

export const ASSISTANT_ACTIONS = {
  schedule: { label: "Расписание на сегодня", href: "/schedule" },
  schedule_week: { label: "Расписание на неделю", href: "/schedule?week=current" },
  grades: { label: "Открыть «Учёбу»", href: "/grades" },
  what_if: { label: "«Что если…» по стипендии", href: "/grades#what-if" },
  requests: { label: "Мои заявки", href: "/requests" },
  request_new: { label: "Заказать справку", href: "/requests/new" },
  request_visa: { label: "Справка для визы", href: "/requests/new?purpose=visa" },
  request_military: { label: "Справка для военкомата", href: "/requests/new?purpose=military" },
  request_work: { label: "Справка для работы", href: "/requests/new?purpose=work" },
  request_social: { label: "Справка в соцзащиту", href: "/requests/new?purpose=social" },
  request_internship: {
    label: "Заявление на стажировку",
    href: "/requests/new?purpose=internship",
  },
  request_other: { label: "Заявка «Другое»", href: "/requests/new?purpose=other" },
  notifications: { label: "Уведомления", href: "/notifications" },
  profile: { label: "Профиль и календарь", href: "/profile" },
} as const satisfies Record<string, { label: string; href: string }>;

export type AssistantActionId = keyof typeof ASSISTANT_ACTIONS;
export type AssistantAction = { id: AssistantActionId; label: string; href: Route };

export const MAX_ACTIONS = 3;

/** Строка действий в ответе модели. Двоеточие — обычное или полноширинное, регистр любой. */
const ACTIONS_LINE = /^\s*действия\s*[:：]\s*(.*)$/iu;

export function isActionId(v: string): v is AssistantActionId {
  return Object.hasOwn(ASSISTANT_ACTIONS, v);
}

/** id → кнопка; чужое (адрес, «javascript:», опечатку) — молча отбрасываем. Не больше трёх, без повторов. */
export function toActions(ids: readonly string[]): AssistantAction[] {
  const out: AssistantAction[] = [];
  for (const raw of ids) {
    const id = raw.trim().toLowerCase();
    if (!isActionId(id) || out.some((a) => a.id === id)) continue;
    const a = ASSISTANT_ACTIONS[id];
    out.push({ id, label: a.label, href: a.href as Route });
    if (out.length === MAX_ACTIONS) break;
  }
  return out;
}

/** Это строка «ДЕЙСТВИЯ: …»? (для придержки потока — её не показываем в чате) */
export function isActionsLine(line: string): boolean {
  return ACTIONS_LINE.test(line);
}

/**
 * Ответ модели целиком → текст без строк «ДЕЙСТВИЯ:» + кнопки из whitelist.
 * Строк может быть несколько (модель повторилась) — берём id из всех, порядок сохраняем.
 */
export function parseActions(text: string): { text: string; actions: AssistantAction[] } {
  const ids: string[] = [];
  const kept: string[] = [];
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const m = ACTIONS_LINE.exec(line);
    if (m) ids.push(...(m[1] ?? "").split(/[,;\s]+/).filter(Boolean));
    else kept.push(line);
  }
  return { text: kept.join("\n").trim(), actions: toActions(ids) };
}
