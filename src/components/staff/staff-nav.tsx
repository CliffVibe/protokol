"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { CalendarClock, Inbox, Megaphone, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Разделы кабинета сотрудника (T08 → T09). Активный — чернильная черта снизу + полужирный, не плашка.

const ITEMS: { href: Route; label: string; icon: LucideIcon }[] = [
  { href: "/staff", label: "Заявки", icon: Inbox },
  { href: "/staff/announcements", label: "Объявления", icon: Megaphone },
  { href: "/staff/schedule", label: "Расписание", icon: CalendarClock },
];

/** «Заявки» активны и на карточке заявки /staff/requests/…; остальные — по своему префиксу. */
function isActive(href: string, pathname: string): boolean {
  if (href === "/staff") return pathname === "/staff" || pathname.startsWith("/staff/requests");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function StaffNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Разделы кабинета" className="min-w-0">
      <ul className="flex flex-wrap gap-x-1">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href, pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-11 items-center gap-2 rounded-lg px-3 text-base -outline-offset-2",
                  active
                    ? "font-semibold text-brand before:absolute before:inset-x-3 before:-bottom-2 before:h-[3px] before:rounded-t-full before:bg-brand forced-colors:before:bg-[CanvasText]"
                    : "text-ink-muted hover:text-ink",
                )}
              >
                {/* Значки — только с 768: на телефоне без них три раздела встают в одну строку */}
                <Icon aria-hidden className="hidden size-5 md:block" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
