import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { formatRelativeDay, formatTime } from "@/lib/dates";
import { requireStudent } from "@/server/auth/guards";
import { notificationsOf } from "@/server/repos/notifications";
import { safeLink } from "@/server/services/request-rules";

export const metadata: Metadata = { title: "Уведомления" };

// Уведомления студента — минимум T08: список своих, новые сверху, ссылка на заявку.
// Вкладки, «прочитано» и бейдж в навигации — T09. Ссылка — только относительный путь (safeLink):
// javascript: и //evil в href не попадут (security-ревью T02).
// Доступ — requireStudent() первой строкой (CLAUDE.md → «Железные правила»).
export default async function NotificationsPage() {
  const ctx = await requireStudent();
  const items = await notificationsOf(ctx);
  const now = new Date();

  return (
    <div className="flex flex-col gap-6 lg:max-w-3xl">
      <PageHeader title="Уведомления" />
      {items.length ? (
        <ul
          aria-label="Уведомления"
          className="flex flex-col divide-y divide-line border-y border-line"
        >
          {items.map((n) => {
            const href = safeLink(n.link);
            const unread = n.readAt === null;
            return (
              <li key={n.id} className="relative flex gap-3 py-4">
                {/* Новое — точка и скрытое «новое»: не только цветом */}
                <span
                  aria-hidden
                  className={
                    unread ? "mt-2 size-2 shrink-0 rounded-full bg-brand" : "mt-2 size-2 shrink-0"
                  }
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-base font-bold text-ink">
                    {unread ? <span className="sr-only">Новое: </span> : null}
                    {href ? (
                      <Link
                        href={href as Route}
                        className="outline-none after:absolute after:inset-0 after:rounded-sm hover:underline focus-visible:after:ring-2 focus-visible:after:ring-brand"
                      >
                        {n.title}
                      </Link>
                    ) : (
                      n.title
                    )}
                  </p>
                  <p className="text-base break-words text-ink">{n.body}</p>
                  <p className="text-sm text-ink-muted tabular">
                    {formatRelativeDay(n.createdAt, now)}, {formatTime(n.createdAt)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          title="Уведомлений пока нет"
          description="Сюда придут переносы пар, объявления деканата и новости по заявкам."
        />
      )}
    </div>
  );
}
