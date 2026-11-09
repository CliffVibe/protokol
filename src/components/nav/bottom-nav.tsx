"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BOTTOM_NAV, isActive } from "@/components/nav/nav-items";
import { UnreadBadge } from "@/components/nav/unread-badge";
import { cn } from "@/lib/utils";

// Нижняя панель на мобильном (< 1024). Каждая цель — во всю ширину колонки и 64px высотой.
// Переходы между вкладками — без анимации (04-design → «Анимация»).
//
// Крупный текст (T13, ux-ревью T05): при 200% подписи рвались («Учё-ба», «За-явки»), а панель занимала
// 179 из 740 px. Теперь панель — контейнер, и когда в её ширину помещается меньше 17em (текст крупнее
// ~140% на телефоне), подписи уходят в sr-only, а размеры — в px: остаются иконки 24px в цели 56px.
// Имя ссылки для скринридера — та же подпись. Порог в em: он считается от размера текста панели.
// Высоту панели меряем и отдаём странице (--spacing-bottom-nav): отступ под панелью совпадает с ней
// при любом размере текста, и плашка концепта в футере не прячется под панель.
export function BottomNav({ unreadCount }: { unreadCount: number }) {
  const pathname = usePathname();
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const root = document.documentElement;
    // CSSOM, а не атрибут style в разметке: прод-CSP запрещает inline-стили, но не setProperty
    const sync = () => {
      const h = nav.offsetHeight;
      if (h > 0) root.style.setProperty("--spacing-bottom-nav", `${h}px`);
      else root.style.removeProperty("--spacing-bottom-nav");
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(nav);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--spacing-bottom-nav");
    };
  }, []);

  return (
    <nav
      ref={ref}
      aria-label="Основная навигация"
      data-bottom-nav
      className="@container fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {/* flex-auto: ширина колонки = ширина подписи + поровну остаток — «Расписание» не обрезается на 360px.
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
                  "@max-[17em]:min-h-[56px] @max-[17em]:gap-0 @max-[17em]:py-[6px]",
                  // Активный — чернильная черта по верхнему краю, как закладка в папке; не плашка
                  active
                    ? "font-semibold text-brand before:absolute before:inset-x-2 before:top-0 before:h-[3px] before:rounded-b-full before:bg-brand forced-colors:before:bg-[CanvasText]"
                    : "text-ink-muted hover:text-ink",
                )}
              >
                <span className="relative flex h-7 w-full max-w-12 shrink-0 items-center justify-center @max-[17em]:h-[32px] @max-[17em]:max-w-[48px]">
                  <Icon
                    aria-hidden
                    className="size-5 @max-[17em]:size-[24px]"
                    strokeWidth={active ? 2.25 : 1.75}
                  />
                  {item.badge ? (
                    <UnreadBadge count={unreadCount} className="absolute -top-1 -right-1" />
                  ) : null}
                </span>
                <span className="max-w-full text-center leading-tight break-words hyphens-auto @max-[17em]:sr-only">
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
