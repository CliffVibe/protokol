import { cn } from "@/lib/utils";

/**
 * Два кольца в правом верхнем углу цветного блока — тихий оттиск печати, только украшение (Б′, 10.11):
 * плашка ближайшей пары и мятный блок «Готова». Цвет — currentColor через className.
 * Блоку нужны relative и overflow-hidden; размеры в px — кольца не растут вместе с текстом.
 * Проявляются один раз (stamp-in, globals.css) — как оттиск; при «уменьшить движение» — сразу.
 */
export function StampRings({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 212 212"
      className={cn(
        "pointer-events-none absolute -top-[106px] -right-[106px] size-[212px] opacity-15 motion-safe:animate-stamp-in",
        className,
      )}
    >
      <circle cx="106" cy="106" r="88" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="106" cy="106" r="104" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
