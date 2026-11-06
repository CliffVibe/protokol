"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { z } from "zod";
import { safeLink } from "@/lib/links";
import { TABS, notificationsHref, tabSchema } from "@/lib/notification-tabs";
import { requireStudent } from "@/server/auth/guards";
import { markAllRead, markRead } from "@/server/repos/notifications";

// Server Actions уведомлений студента (T09). Первой инструкцией — requireStudent() (guards.test.ts).
// id уведомления из формы — только «какое открыть»; чьё оно, решает репозиторий по ctx.studentId (S1).

const idSchema = z.string().regex(/^[A-Za-z0-9-]{1,80}$/);

/**
 * Открыть уведомление: отметить прочитанным и перейти по его ссылке. Это форма, а не ссылка с побочным
 * эффектом: prefetch и переход по GET ничего не отмечают. Чужое или несуществующее — просто обратно в список.
 */
export async function openNotificationAction(formData: FormData): Promise<void> {
  const ctx = await requireStudent();
  const tab = tabSchema.catch("all").parse(formData.get("tab"));
  const id = idSchema.safeParse(formData.get("id"));
  const back = notificationsHref(tab);
  if (!id.success) redirect(back);
  const n = await markRead(ctx, id.data);
  revalidatePath("/", "layout");
  redirect((safeLink(n?.link) ?? back) as Route);
}

export async function markAllReadAction(formData: FormData): Promise<void> {
  const ctx = await requireStudent();
  const tab = tabSchema.catch("all").parse(formData.get("tab"));
  // Только вид текущей вкладки: на «Расписании» не гасим «Заявки», которых человек не видел
  await markAllRead(ctx, TABS[tab].kind ?? undefined);
  revalidatePath("/", "layout");
  redirect(notificationsHref(tab));
}
