"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SIDE_NAV, isActive } from "@/components/nav/nav-items";
import { UnreadBadge } from "@/components/nav/unread-badge";
import { cn } from "@/lib/utils";

// Пункты боковой панели (≥ 1024). Логотип и переключатель темы — в layout вокруг.
export function SideNav({ unreadCount }: { unreadCount: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Основная навигация">
      <ul className="flex flex-col gap-1">
        {SIDE_NAV.map((item) => {
          const active = isActive(item, pathname);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-lg px-3 text-body font-medium -outline-offset-2 transition-colors duration-150 ease-out",
                  active
                    ? "bg-brand-soft font-semibold text-brand"
                    : "text-ink-muted hover:bg-bg hover:text-ink",
                )}
              >
                <Icon aria-hidden className="size-5 shrink-0" strokeWidth={active ? 2.25 : 1.75} />
                <span className="min-w-0 flex-1 break-words">{item.label}</span>
                {item.badge ? <UnreadBadge count={unreadCount} /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
