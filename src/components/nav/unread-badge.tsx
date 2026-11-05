import { cn } from "@/lib/utils";

/** «3 непрочитанных» — для скринридера, рядом с названием пункта. */
export function unreadLabel(count: number): string {
  // «1, 21, 101 непрочитанное», но «11 непрочитанных»; для 2–4 и 5+ прилагательное одинаковое.
  const one = count % 10 === 1 && count % 100 !== 11;
  return `${count} ${one ? "непрочитанное" : "непрочитанных"}`;
}

/** Бейдж непрочитанных: число видно глазами, полный текст — скринридеру. 0 — не показываем. */
export function UnreadBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-caption leading-none font-semibold text-bg tabular",
        className,
      )}
    >
      <span aria-hidden>{count > 99 ? "99+" : count}</span>
      <span className="sr-only">, {unreadLabel(count)}</span>
    </span>
  );
}
