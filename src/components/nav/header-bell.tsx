"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { NOTIFICATIONS, isActive } from "@/components/nav/nav-items";
import { UnreadBadge, unreadLabel } from "@/components/nav/unread-badge";
import { cn } from "@/lib/utils";

// Колокольчик в мобильной шапке (T09): уведомления за 1 касание, а не через «Ещё» (внешняя оценка 06.11).
// Число непрочитанных — только здесь (решение человека 06.11): на «Ещё» его нет, чтобы не дублировать.
// Цель касания — 44px в px: при тексте 200% кнопка не растёт и не выталкивает логотип.
export function HeaderBell({ unreadCount }: { unreadCount: number }) {
  const active = isActive(NOTIFICATIONS, usePathname());
  const label = unreadCount > 0 ? `Уведомления, ${unreadLabel(unreadCount)}` : "Уведомления";
  return (
    <Link
      href={NOTIFICATIONS.href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      data-header-bell
      className={cn(
        "relative ml-auto flex size-[44px] shrink-0 items-center justify-center rounded-lg -outline-offset-2",
        active ? "text-brand" : "text-ink hover:text-brand",
      )}
    >
      {/* Значок и бейдж — в px: при тексте 200% цель 44px не растёт, и бейдж не должен закрыть значок */}
      <Bell aria-hidden className="size-[24px]" strokeWidth={active ? 2.25 : 1.75} />
      {/* Число видно глазами; полный текст — в aria-label ссылки, поэтому бейдж скрываем от скринридера */}
      <span aria-hidden className="absolute top-0.5 right-0.5">
        <UnreadBadge count={unreadCount} className="h-[18px] min-w-[18px] px-[5px] text-[11px]" />
      </span>
    </Link>
  );
}
