"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BOTTOM_NAV, isActive } from "@/components/nav/nav-items";
import { UnreadBadge } from "@/components/nav/unread-badge";
import { cn } from "@/lib/utils";

// Нижняя панель на мобильном (< 1024). Каждая цель — во всю ширину колонки и 64px высотой.
// Переходы между вкладками — без анимации (04-design → «Анимация»).
export function BottomNav({ unreadCount }: { unreadCount: number }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Основная навигация"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {/* flex-auto: ширина колонки = ширина подписи + поровну остаток — «Расписание» не обрезается на 360px */}
      <ul className="mx-auto flex max-w-[560px] px-1">
        {BOTTOM_NAV.map((item) => {
          const active = isActive(item, pathname);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-auto">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 min-w-11 flex-col items-center justify-center gap-1 rounded-lg px-1 text-caption font-medium -outline-offset-2",
                  active ? "text-brand" : "text-ink-muted hover:text-ink",
                )}
              >
                <span
                  className={cn(
                    "relative flex h-7 w-12 items-center justify-center rounded-full",
                    active && "bg-brand-soft",
                  )}
                >
                  <Icon aria-hidden className="size-5" strokeWidth={active ? 2.25 : 1.75} />
                  {item.badge ? (
                    <UnreadBadge count={unreadCount} className="absolute -top-1 -right-1" />
                  ) : null}
                </span>
                <span className="whitespace-nowrap">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
