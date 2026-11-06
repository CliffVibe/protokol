import Link from "next/link";
import type { Route } from "next";
import { cn } from "@/lib/utils";

// Блок ленты: заголовок + ссылка в раздел (1 касание) + содержимое. Без карточки — раздел документа.
export function FeedSection({
  id,
  title,
  link,
  children,
  className,
}: {
  id: string;
  title: string;
  link?: { href: Route; label: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 id={id} className="font-heading text-xl font-bold text-ink">
          {title}
        </h2>
        {link ? (
          <Link
            href={link.href}
            className="inline-flex min-h-11 items-center text-sm font-bold text-brand underline-offset-4 hover:underline"
          >
            {link.label}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Список строк под тонкими линиями — как графы бланка. */
export function FeedList({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <ul aria-label={label} className="flex flex-col divide-y divide-line border-y border-line">
      {children}
    </ul>
  );
}
