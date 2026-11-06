import {
  AlarmClock,
  CalendarClock,
  ChevronRight,
  FileText,
  Megaphone,
  Pin,
  type LucideIcon,
} from "lucide-react";
import type { NotificationKind } from "@/generated/prisma/client";
import { Markdown } from "@/components/markdown";
import { formatRelativeDay, formatTime } from "@/lib/dates";
import { safeLink } from "@/lib/links";
import type { Tab } from "@/lib/notification-tabs";
import { cn } from "@/lib/utils";
import { openNotificationAction } from "@/server/actions/notifications";
import type { NotificationRow } from "@/server/repos/notifications";

// Строки уведомлений и объявлений (T09). Вид — иконка + скрытая подпись (цвет не единственный носитель смысла).

const KIND: Record<NotificationKind, { icon: LucideIcon; label: string }> = {
  ANNOUNCEMENT: { icon: Megaphone, label: "Объявление" },
  DEADLINE: { icon: AlarmClock, label: "Срок" },
  REQUEST_STATUS: { icon: FileText, label: "Заявка" },
  SCHEDULE_CHANGE: { icon: CalendarClock, label: "Расписание" },
};

/**
 * Уведомление. Касание по строке — форма «открыть»: отмечает прочитанным и ведёт по ссылке
 * (prefetch и GET ничего не отмечают). Касание — по всей строке через ::after у кнопки.
 */
export function NotificationRowItem({ n, tab, now }: { n: NotificationRow; tab: Tab; now: Date }) {
  const unread = n.readAt === null;
  const { icon: Icon, label } = KIND[n.kind];
  const hasLink = safeLink(n.link) !== null;
  return (
    <li
      data-notification={n.id}
      data-link={safeLink(n.link) ?? undefined}
      className="relative flex gap-3 py-4"
    >
      <span
        aria-hidden
        className="relative mt-0.5 flex size-6 shrink-0 items-center justify-center"
      >
        <Icon className={cn("size-5", unread ? "text-brand" : "text-ink-muted")} />
        {/* Новое — точка; для скринридера — «Новое:» перед заголовком */}
        {unread ? (
          <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-bg bg-brand forced-colors:bg-[CanvasText]" />
        ) : null}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <form action={openNotificationAction}>
          <input type="hidden" name="id" value={n.id} />
          <input type="hidden" name="tab" value={tab} />
          <button
            type="submit"
            className={cn(
              "text-left text-base break-words text-ink outline-none after:absolute after:inset-0 after:rounded-sm hover:underline focus-visible:after:ring-2 focus-visible:after:ring-brand",
              unread ? "font-bold" : "font-normal",
            )}
          >
            {unread ? <span className="sr-only">Новое: </span> : null}
            <span className="sr-only">{label}. </span>
            {n.title}
          </button>
        </form>
        <p className="text-base break-words text-ink">{n.body}</p>
        <p className="text-sm text-ink-muted tabular">
          {formatRelativeDay(n.createdAt, now)}, {formatTime(n.createdAt)}
        </p>
      </div>
      {hasLink ? (
        <ChevronRight aria-hidden className="mt-0.5 size-5 shrink-0 self-start text-ink-muted" />
      ) : null}
    </li>
  );
}

export type BoardAnnouncement = {
  id: string;
  title: string;
  body: string;
  publishedAt: Date;
  pinned: boolean;
};

/** Объявление на доске: закреплённое — с булавкой и словом; текст — с разметкой (S5, без сырого HTML). */
export function AnnouncementItem({
  announcement: a,
  now,
  fresh = false,
}: {
  announcement: BoardAnnouncement;
  now: Date;
  /** Уведомление о нём ещё не открыто — та же метка «Новое», что у строки уведомления */
  fresh?: boolean;
}) {
  return (
    <li
      id={`announcement-${a.id}`}
      className="flex scroll-mt-6 flex-col gap-2 py-4 target:-mx-3 target:rounded-lg target:bg-brand-soft target:px-3"
    >
      <p className="flex flex-wrap items-center gap-x-3 text-sm text-ink-muted">
        {/* Новое — точка и слово, как у строки уведомления: не только цветом */}
        {fresh ? (
          <span className="inline-flex items-center gap-1.5 font-bold text-brand">
            <span
              aria-hidden
              className="size-2 rounded-full bg-brand forced-colors:bg-[CanvasText]"
            />
            Новое
          </span>
        ) : null}
        {a.pinned ? (
          <span className="inline-flex items-center gap-1 font-bold text-brand">
            <Pin aria-hidden className="size-4" />
            Закреплено
          </span>
        ) : null}
        <span className="tabular">
          {formatRelativeDay(a.publishedAt, now)}, {formatTime(a.publishedAt)}
        </span>
      </p>
      <h2 className="font-heading text-lg font-bold break-words text-ink">{a.title}</h2>
      <Markdown text={a.body} />
    </li>
  );
}
