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
  className?: string;
};

// Заголовок экрана: единственный h1 на странице. На 360px — 28px (text-h1), на десктопе — 36px.
export function PageHeader({ title, description, action, back, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      {back ? (
        <Link
          href={back.href}
          className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-lg px-2 text-small font-medium text-brand hover:underline"
        >
          <ChevronLeft aria-hidden className="size-4" />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-h1 lg:text-display">{title}</h1>
          {description ? <p className="text-body text-ink-muted">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}
