import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { MORE_ITEMS } from "@/components/nav/nav-items";
import { UnreadBadge } from "@/components/nav/unread-badge";
import { PageHeader } from "@/components/page-header";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { getThemePreference } from "@/lib/theme-server";

export const metadata: Metadata = { title: "Ещё" };

// «Ещё» на мобильном: разделы, которые не влезли в нижнюю панель, и настройки.
// TODO(T03): requireStudent() — первой строкой, до любых данных.
export default async function MorePage() {
  const theme = await getThemePreference();
  // TODO(T09): число непрочитанных текущего студента.
  const unreadCount = 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Ещё" />
      <nav aria-label="Другие разделы">
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {MORE_ITEMS.map(({ href, label, icon: Icon, badge }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex min-h-14 items-center gap-3 px-4 text-body font-medium -outline-offset-2 hover:bg-bg"
              >
                <Icon aria-hidden className="size-5 shrink-0 text-brand" />
                <span className="flex-1">{label}</span>
                {badge ? <UnreadBadge count={unreadCount} /> : null}
                <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="sr-only">Настройки</h2>
        <ThemeSwitcher value={theme} />
      </section>
    </div>
  );
}
