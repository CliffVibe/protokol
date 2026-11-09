import Link from "next/link";
import type { Route } from "next";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description?: React.ReactNode;
  /** Кнопка или ссылка справа от заголовка (на 360px уходит под него). */
  action?: React.ReactNode;
  back?: { href: Route; label: string };
  /** 1 — заголовок экрана (по умолчанию). 2 — только для примеров на витрине. */
  titleLevel?: 1 | 2;
  className?: string;
};

// Заголовок экрана: единственный h1 на странице. На 360px — 28px (text-2xl), на десктопе — 36px.
export function PageHeader({
  title,
  description,
  action,
  back,
  titleLevel = 1,
  className,
}: PageHeaderProps) {
  const Title = `h${titleLevel}` as const;
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      {back ? (
        <Link
          href={back.href}
          className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-lg px-2 text-sm text-brand hover:underline"
        >
          <ChevronLeft aria-hidden className="size-4" />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          {/* break-words: одно длинное слово («Эконометрика» при тексте 200%) переносится, а не растягивает экран (T07).
              hyphens-auto: переносится по слогам с дефисом («Уведом-ления»), а не рвётся посреди слога (ревью T09);
              словарь переносов берётся из <html lang="ru">. hyphenate-limit-chars: только слова от 10 букв и не короче
              4 букв по краям — «посоль-ства» при обычном размере не рвём (ux-reviewer T13) */}
          <Title className="text-2xl tracking-tight break-words hyphens-auto [hyphenate-limit-chars:10_4_4] lg:text-3xl">
            {title}
          </Title>
          {description ? (
            <p className="text-base break-words text-ink-muted">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}
