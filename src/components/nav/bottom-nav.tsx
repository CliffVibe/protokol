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
      data-bottom-nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {/* flex-auto: ширина колонки = ширина подписи + поровну остаток — «Расписание» не обрезается на 360px.
          min-w-0 + перенос: при тексте 200% колонки сжимаются, подписи переносятся — все 5 пунктов на экране.
          Минимум цели — в px (44), а не в rem: rem растёт вместе с текстом и выталкивает пункты за экран. */}
      <ul className="mx-auto flex max-w-[560px] px-1">
        {BOTTOM_NAV.map((item) => {
          const active = isActive(item, pathname);
          const Icon = item.icon;
          return (
            <li key={item.href} className="min-w-0 flex-auto">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-16 min-w-[44px] flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-xs -outline-offset-2",
                  // Активный — чернильная черта по верхнему краю, как закладка в папке; не плашка
                  active
                    ? "font-semibold text-brand before:absolute before:inset-x-2 before:top-0 before:h-[3px] before:rounded-b-full before:bg-brand forced-colors:before:bg-[CanvasText]"
                    : "font-medium text-ink-muted hover:text-ink",
                )}
              >
                <span className="relative flex h-7 w-full max-w-12 shrink-0 items-center justify-center">
                  <Icon aria-hidden className="size-5" strokeWidth={active ? 2.25 : 1.75} />
                  {item.badge ? (
                    <UnreadBadge count={unreadCount} className="absolute -top-1 -right-1" />
                  ) : null}
                </span>
                <span className="max-w-full text-center leading-tight break-words hyphens-auto">
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
