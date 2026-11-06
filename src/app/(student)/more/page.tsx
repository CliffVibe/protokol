import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SessionActions } from "@/components/logout-button";
import { MORE_ITEMS } from "@/components/nav/nav-items";
import { UnreadBadge } from "@/components/nav/unread-badge";
import { PageHeader } from "@/components/page-header";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { getThemePreference } from "@/lib/theme-server";
import { requireStudent } from "@/server/auth/guards";
import { unreadCountOf } from "@/server/repos/notifications";

export const metadata: Metadata = { title: "Ещё" };

// «Ещё» на мобильном: разделы, которые не влезли в нижнюю панель, и настройки.
// Доступ — requireStudent() первой строкой, до любых данных (CLAUDE.md → «Железные правила»).
export default async function MorePage() {
  const ctx = await requireStudent();
  const [theme, unreadCount] = await Promise.all([getThemePreference(), unreadCountOf(ctx)]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Ещё" />
      <nav aria-label="Другие разделы">
        {/* Как оглавление документа: строки с тонкими линиями на бумаге, без карточки */}
        <ul className="flex flex-col divide-y divide-line border-y border-line">
          {MORE_ITEMS.map(({ href, label, badge }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex min-h-14 items-center gap-3 px-1 text-lg -outline-offset-2 hover:text-brand"
              >
                <span className="min-w-0 flex-1 py-2 break-words hyphens-auto">{label}</span>
                {badge ? <UnreadBadge count={unreadCount} /> : null}
                <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <section className="max-w-sm">
        <h2 className="sr-only">Настройки</h2>
        <ThemeSwitcher value={theme} />
      </section>
      <SessionActions className="max-w-xl" />
    </div>
  );
}
