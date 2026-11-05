"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SIDE_NAV, isActive } from "@/components/nav/nav-items";
import { UnreadBadge } from "@/components/nav/unread-badge";
import { cn } from "@/lib/utils";

// Пункты боковой панели (≥ 1024). Только слова, как оглавление: места хватает, иконки бы их дублировали
// (иконки остаются в нижней панели на телефоне — там они помогают узнавать пункт с одного взгляда).
// Логотип и переключатель темы — в layout вокруг.
export function SideNav({ unreadCount }: { unreadCount: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Основная навигация">
      <ul className="flex flex-col gap-1">
        {SIDE_NAV.map((item) => {
          const active = isActive(item, pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-body font-medium -outline-offset-2 transition-colors duration-150 ease-out",
                  // Активный — чернильная черта слева, как пометка на полях; не плашка
                  active
                    ? "font-semibold text-brand before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-brand"
                    : "text-ink-muted hover:bg-surface hover:text-ink",
                )}
              >
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
