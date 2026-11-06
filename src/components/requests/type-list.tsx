import Link from "next/link";
import type { Route } from "next";
import { ChevronRight } from "lucide-react";

export type TypeListItem = {
  key: string;
  href: Route;
  title: string;
  description?: string;
  meta?: string;
  /** Короткая пометка над описанием: «На английском — обычно просят для визы». */
  note?: string;
};

// Строки-ссылки под линиями (каталог T08, шаги мастера T10): касание по всей строке через ::after,
// заливных кнопок нет — выбор, а не действие.
export function TypeList({ label, items }: { label: string; items: TypeListItem[] }) {
  return (
    <ul aria-label={label} className="flex flex-col divide-y divide-line border-y border-line">
      {items.map((t) => (
        <li key={t.key} className="relative flex items-center gap-3 py-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Link
              href={t.href}
              className="self-start text-base font-bold break-words text-ink outline-none after:absolute after:inset-0 after:rounded-sm hover:underline focus-visible:after:ring-2 focus-visible:after:ring-brand"
            >
              {t.title}
            </Link>
            {t.note ? <p className="text-sm font-bold text-brand">{t.note}</p> : null}
            {t.description ? <p className="text-sm text-ink">{t.description}</p> : null}
            {t.meta ? <p className="text-sm text-ink-muted">{t.meta}</p> : null}
          </div>
          <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-muted" />
        </li>
      ))}
    </ul>
  );
}
