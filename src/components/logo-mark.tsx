// Логотип «Протокола» — лист бланка с загнутым углом и «П» (вариант B, выбор человека 06.11, T05;
// сравнение вариантов — docs/process/screenshots/05-T05-logo-variants.png). Рисунок свой,
// элементы герба и логотипа МГИМО не используются. Цвет — currentColor (по умолчанию text-seal).
//   variant="mark"  — малый знак: шапка, сайдбар, значок сайта (тот же рисунок — src/app/icon.svg).
//   variant="sheet" — крупный лист со строками для экрана входа.
import { cn } from "@/lib/utils";

/** «П» с засечками, координаты 20..44 × 20.4..44.4 в сетке 64. */
const P =
  "M20 20.4h24v4.25h-2.22v17.72h1.85v2.03h-8.49v-2.03h1.84V24.65h-9.96v17.72h1.84v2.03h-8.49v-2.03h1.85V24.65H20Z";

/** Лист и загнутый угол в сетке 64 — общие для знака, крупного листа и icon.svg. */
export const LOGO_SHEET_PATH = "M12 5h27l14 14v40H12Z";
export const LOGO_FOLD_PATH = "M39 5v14h14";
export const LOGO_P_TRANSFORM = "translate(32.5 38) scale(0.62) translate(-32 -32.4)";
export const LOGO_P_PATH = P;

type LogoMarkProps = {
  className?: string;
  /** Подпись для скринридера. Без неё знак декоративный (рядом и так есть слово «Протокол»). */
  label?: string;
  variant?: "mark" | "sheet";
};

export function LogoMark({ className, label, variant = "mark" }: LogoMarkProps) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };

  if (variant === "mark") {
    return (
      <svg viewBox="0 0 64 64" className={cn("size-8 shrink-0 text-seal", className)} {...a11y}>
        <path
          d={LOGO_SHEET_PATH}
          fill="none"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinejoin="round"
        />
        <path
          d={LOGO_FOLD_PATH}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
        <path d={P} fill="currentColor" transform={LOGO_P_TRANSFORM} />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 120 120" className={cn("size-28 shrink-0 text-seal", className)} {...a11y}>
      <path
        d="M22 8h54l24 24v80H22Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path
        d="M76 8v24h24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path
        d={P}
        fill="currentColor"
        transform="translate(61 56) scale(1.15) translate(-32 -32.4)"
      />
      {/* Строки бланка — тише, как графы, которые ещё предстоит заполнить */}
      <path d="M36 88h50M36 98h34" stroke="currentColor" strokeWidth="1.6" opacity="0.7" />
    </svg>
  );
}
