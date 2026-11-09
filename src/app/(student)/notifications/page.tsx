import type { Metadata } from "next";
import Link from "next/link";
import { CheckCheck } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { NotificationRowItem, AnnouncementItem } from "@/components/notifications/rows";
import { UnreadBadge } from "@/components/nav/unread-badge";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { plural } from "@/lib/dates";
import { TABS, TAB_KEYS, notificationsHref, parseTab, type Tab } from "@/lib/notification-tabs";
import { cn } from "@/lib/utils";
import { requireStudent } from "@/server/auth/guards";
import { markAllReadAction } from "@/server/actions/notifications";
import { announcementsFor } from "@/server/repos/announcements";
import { notificationsOf, unreadAnnouncementIds, unreadByKind } from "@/server/repos/notifications";

export const metadata: Metadata = { title: "Уведомления" };

// Уведомления студента (T09): вкладки «Все / Объявления / Дедлайны / Заявки / Расписание» ссылками ?tab=,
// непрочитанные выделены (точка + полужирный + скрытое «Новое:» — не только цветом), «Отметить всё прочитанным».
// «Объявления» — доска объявлений деканата, адресованных этому студенту (фильтр — в репозитории, S1),
// закреплённые сверху, полный текст с разметкой (S5: без сырого HTML).
// Доступ — requireStudent() первой строкой (CLAUDE.md → «Железные правила»).

const EMPTY: Record<Tab, { title: string; description: string }> = {
  all: {
    title: "Уведомлений пока нет",
    description: "Сюда придут переносы пар, объявления деканата и новости по заявкам.",
  },
  announcements: {
    title: "Объявлений для вас нет",
    description:
      "Когда деканат напишет вашему факультету, курсу или группе, объявление появится здесь.",
  },
  deadlines: {
    title: "Напоминаний о сроках нет",
    description: "Ближайшие дедлайны видны на главной в блоке «Скоро».",
  },
  requests: {
    title: "Новостей по заявкам нет",
    description: "Когда деканат изменит статус вашей заявки, напишем здесь.",
  },
  schedule: {
    title: "Изменений расписания нет",
    description: "Если пару перенесут, уведомление придёт сюда и появится на главной.",
  },
};

export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const ctx = await requireStudent();
  const tab = parseTab((await searchParams).tab);
  const now = new Date();
  const kind = TABS[tab].kind;

  const [unread, items, board, freshIds] = await Promise.all([
    unreadByKind(ctx),
    tab === "announcements" ? Promise.resolve([]) : notificationsOf(ctx, kind ?? undefined),
    tab === "announcements" ? announcementsFor(ctx, now) : Promise.resolve([]),
    tab === "announcements" ? unreadAnnouncementIds(ctx) : Promise.resolve(new Set<string>()),
  ]);
  const unreadTotal = Object.values(unread).reduce((a, b) => a + (b ?? 0), 0);
  const unreadHere = kind ? (unread[kind] ?? 0) : unreadTotal;
  // Закреплённые сверху, дальше — новые первыми (репозиторий отдаёт по дате)
  const announcements = [...board].sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const fresh = items.filter((n) => n.readAt === null);
  const seen = items.filter((n) => n.readAt !== null);

  const markAll = (
    <form action={markAllReadAction}>
      <input type="hidden" name="tab" value={tab} />
      {/* Тихая кнопка: главное на экране — новые уведомления, а не действие над ними */}
      <Button
        type="submit"
        variant="ghost"
        className="h-auto min-h-11 px-2 py-2 text-left whitespace-normal text-brand"
      >
        <CheckCheck aria-hidden data-icon="inline-start" />
        {tab === "all" ? "Отметить всё прочитанным" : "Отметить прочитанными"}
      </Button>
    </form>
  );

  return (
    <div className="flex flex-col gap-6 lg:max-w-3xl">
      <PageHeader
        title="Уведомления"
        description={
          unreadTotal
            ? `${unreadTotal} ${plural(unreadTotal, ["новое", "новых", "новых"])}`
            : "Новых нет — вы всё прочитали."
        }
      />

      <nav aria-label="Виды уведомлений">
        <ul className="flex flex-wrap gap-x-5 border-b border-line">
          {TAB_KEYS.map((t) => {
            const k = TABS[t].kind;
            const count = k ? (unread[k] ?? 0) : unreadTotal;
            return (
              <li key={t}>
                <Link
                  href={notificationsHref(t)}
                  aria-current={t === tab ? "page" : undefined}
                  className={cn(
                    // min-w-11: «Все» короче 44px — цель касания держим и для коротких подписей
                    "-mb-px inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 border-b-2 text-base",
                    t === tab
                      ? "border-brand font-bold text-ink"
                      : "border-transparent text-ink-muted hover:text-ink",
                  )}
                >
                  {TABS[t].label}
                  <UnreadBadge count={count} />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {tab === "announcements" ? (
        <>
          {unreadHere > 0 ? markAll : null}
          {announcements.length ? (
            <ul
              aria-label="Объявления деканата"
              className="flex flex-col divide-y divide-line border-b border-line"
            >
              {announcements.map((a) => (
                <AnnouncementItem
                  key={a.id}
                  announcement={a}
                  now={now}
                  fresh={freshIds.has(a.id)}
                />
              ))}
            </ul>
          ) : (
            <EmptyState {...EMPTY.announcements} />
          )}
        </>
      ) : items.length ? (
        <>
          {/* Новые — отдельным разделом сверху и громче, прочитанные — ниже и тише (человек 06.11:
              «в тёмной теме всё сливается в кашу»). Кнопка «Отметить…» — тихая, в заголовке раздела */}
          {fresh.length ? (
            <section aria-labelledby="fresh-title" className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <h2 id="fresh-title" className="text-lg">
                  Новые
                </h2>
                {markAll}
              </div>
              <ul
                aria-labelledby="fresh-title"
                className="flex flex-col divide-y divide-line border-b border-line"
              >
                {fresh.map((n) => (
                  <NotificationRowItem key={n.id} n={n} tab={tab} now={now} />
                ))}
              </ul>
            </section>
          ) : null}
          {seen.length ? (
            <section aria-labelledby="seen-title" className="flex flex-col gap-1">
              <h2 id="seen-title" className="text-base font-bold text-ink-muted">
                Прочитанные
              </h2>
              <ul
                aria-labelledby="seen-title"
                className="flex flex-col divide-y divide-line border-y border-line"
              >
                {seen.map((n) => (
                  <NotificationRowItem key={n.id} n={n} tab={tab} now={now} />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <EmptyState {...EMPTY[tab]} />
      )}
    </div>
  );
}
