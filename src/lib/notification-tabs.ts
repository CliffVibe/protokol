// Вкладки уведомлений (T09): ?tab= в адресе, разбор — zod (битое значение → «Все», не 500).
import type { Route } from "next";
import { z } from "zod";
import type { NotificationKind } from "@/generated/prisma/client";

export const TABS = {
  all: { label: "Все", kind: null },
  announcements: { label: "Объявления", kind: "ANNOUNCEMENT" },
  deadlines: { label: "Дедлайны", kind: "DEADLINE" },
  requests: { label: "Заявки", kind: "REQUEST_STATUS" },
  schedule: { label: "Расписание", kind: "SCHEDULE_CHANGE" },
} as const satisfies Record<string, { label: string; kind: NotificationKind | null }>;

export type Tab = keyof typeof TABS;
export const TAB_KEYS = Object.keys(TABS) as Tab[];
export const tabSchema = z.enum(TAB_KEYS as [Tab, ...Tab[]]);

export function parseTab(raw: unknown): Tab {
  return tabSchema.catch("all").parse(raw);
}

export function notificationsHref(tab: Tab): Route {
  return (tab === "all" ? "/notifications" : `/notifications?tab=${tab}`) as Route;
}
