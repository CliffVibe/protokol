import { cn } from "@/lib/utils";
import type { StatusTone } from "@/components/status-chip";
import { SCHOLARSHIP_MIN_RATING } from "@/server/services/academics";

const FILL: Record<StatusTone, string> = {
  neutral: "fill-ink-muted",
  brand: "fill-brand",
  ok: "fill-ok",
  warn: "fill-warn",
  danger: "fill-danger",
  seal: "fill-seal",
};

/**
 * Рейтинг-бар 0–100 с засечкой на 60 (порог стипендии). Только картинка: число «54/100» рядом — текстом,
 * поэтому бар скрыт от скринридера.
 * SVG-атрибуты, а не style={{ width }}: прод-CSP (`style-src 'nonce-…'`) режет inline-стили,
 * и в dev бар был бы, а на проде — нет.
 */
export function RatingBar({
  value,
  tone,
  className,
}: {
  value: number | null;
  tone: StatusTone;
  className?: string;
}) {
  const width = value === null ? 0 : Math.min(100, Math.max(0, value));
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 10"
      preserveAspectRatio="none"
      className={cn("block h-2.5 w-full overflow-visible", className)}
    >
      <rect x="0" y="2" width="100" height="6" rx="3" className="fill-line" />
      {width > 0 ? (
        <rect x="0" y="2" width={width} height="6" rx="3" className={FILL[tone]} />
      ) : null}
      {/* Засечка порога — чернилами поверх, видна и на заполненной части */}
      <rect x={SCHOLARSHIP_MIN_RATING - 0.4} y="0" width="0.8" height="10" className="fill-ink" />
    </svg>
  );
}
