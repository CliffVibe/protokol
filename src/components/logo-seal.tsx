// Логотип «Протокола» — круглая печать (docs/04-design.md → «Логотип»). Рисунок свой;
// герб и логотип МГИМО и их элементы не используются.
//   variant="mark"  — знак для мелких размеров (≤ 48px): розетка, кольцо-просвет, «П» с засечками.
//                     Один контур с fill-rule="evenodd"; тот же — в src/app/icon.svg.
//   variant="stamp" — оттиск штампа для крупных размеров: двойное кольцо, надписи по дуге,
//                     звёздочки, лёгкая неровность резины (SVG-фильтр, без растров).
import { useId } from "react";
import { cn } from "@/lib/utils";

export const SEAL_MARK_PATH =
  "M32 2.8Q36.11 .77 39.56 3.79 44.05 2.9 46.6 6.71 51.18 7.01 52.65 11.35 56.99 12.82 57.29 17.4 61.1 19.95 60.21 24.44 63.23 27.89 61.2 32 63.23 36.11 60.21 39.56 61.1 44.05 57.29 46.6 56.99 51.18 52.65 52.65 51.18 56.99 46.6 57.29 44.05 61.1 39.56 60.21 36.11 63.23 32 61.2 27.89 63.23 24.44 60.21 19.95 61.1 17.4 57.29 12.82 56.99 11.35 52.65 7.01 51.18 6.71 46.6 2.9 44.05 3.79 39.56 .77 36.11 2.8 32 .77 27.89 3.79 24.44 2.9 19.95 6.71 17.4 7.01 12.82 11.35 11.35 12.82 7.01 17.4 6.71 19.95 2.9 24.44 3.79 27.89 .77 32 2.8ZM6.6 32a25.4 25.4 0 1 1 50.8 0 25.4 25.4 0 1 1-50.8 0ZM7.9 32a24.1 24.1 0 1 1 48.2 0 24.1 24.1 0 1 1-48.2 0ZM20 20.4h24v4.25h-2.22v17.72h1.85v2.03h-8.49v-2.03h1.84V24.65h-9.96v17.72h1.84v2.03h-8.49v-2.03h1.85V24.65H20Z";

const STAMP_EDGE =
  "M60 4.5Q64.53 2.48 68.68 5.18 73.47 3.89 77.15 7.22 82.08 6.69 85.2 10.55 90.15 10.8 92.62 15.1 97.47 16.12 99.24 20.76 103.88 22.53 104.9 27.38 109.2 29.85 109.45 34.8 113.31 37.92 112.78 42.85 116.11 46.53 114.82 51.32 117.52 55.47 115.5 60 117.52 64.53 114.82 68.68 116.11 73.47 112.78 77.15 113.31 82.08 109.45 85.2 109.2 90.15 104.9 92.62 103.88 97.47 99.24 99.24 97.47 103.88 92.62 104.9 90.15 109.2 85.2 109.45 82.08 113.31 77.15 112.78 73.47 116.11 68.68 114.82 64.53 117.52 60 115.5 55.47 117.52 51.32 114.82 46.53 116.11 42.85 112.78 37.92 113.31 34.8 109.45 29.85 109.2 27.38 104.9 22.53 103.88 20.76 99.24 16.12 97.47 15.1 92.62 10.8 90.15 10.55 85.2 6.69 82.08 7.22 77.15 3.89 73.47 5.18 68.68 2.48 64.53 4.5 60 2.48 55.47 5.18 51.32 3.89 46.53 7.22 42.85 6.69 37.92 10.55 34.8 10.8 29.85 15.1 27.38 16.12 22.53 20.76 20.76 22.53 16.12 27.38 15.1 29.85 10.8 34.8 10.55 37.92 6.69 42.85 7.22 46.53 3.89 51.32 5.18 55.47 2.48 60 4.5Z";
const STAMP_STARS =
  "M15.5 56.8l.85 2.04 2.19.17-1.67 1.43.51 2.15-1.88-1.15-1.88 1.15.51-2.15-1.67-1.43 2.19-.17ZM104.5 56.8l.85 2.04 2.19.17-1.67 1.43.51 2.15-1.88-1.15-1.88 1.15.51-2.15-1.67-1.43 2.19-.17Z";
const STAMP_MONOGRAM =
  "M45 45.5h30v5.31h-2.77v22.15h2.31v2.54H63.92v-2.54h2.31V50.81H53.77v22.15h2.31v2.54H45.46v-2.54h2.31V50.81H45Z";
// Дуги для надписей: верхняя — по часовой (буквы «наружу»), нижняя — против (буквы читаются прямо)
const ARC_TOP = "M18.5 60A41.5 41.5 0 0 1 101.5 60";
const ARC_BOTTOM = "M11.8 60A48.2 48.2 0 0 0 108.2 60";

type LogoSealProps = {
  className?: string;
  /** Подпись для скринридера. Без неё логотип декоративный (рядом и так есть текст «Протокол»). */
  label?: string;
  variant?: "mark" | "stamp";
};

export function LogoSeal({ className, label, variant = "mark" }: LogoSealProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };

  if (variant === "mark") {
    return (
      <svg
        viewBox="0 0 64 64"
        className={cn("size-8 shrink-0 text-seal", className)}
        fill="currentColor"
        {...a11y}
      >
        <path fillRule="evenodd" d={SEAL_MARK_PATH} />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 120 120"
      className={cn("size-40 max-w-full shrink-0 text-seal", className)}
      fill="none"
      stroke="currentColor"
      {...a11y}
    >
      <defs>
        {/* Оттиск резиновой печати: края чуть «плывут», в заливке редкие непропечатанные точки */}
        <filter id={`ink-${uid}`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            seed="4"
            result="wobble"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="wobble"
            scale="1.1"
            xChannelSelector="R"
            yChannelSelector="G"
            result="rough"
          />
          <feTurbulence
            type="fractalNoise"
            baseFrequency="1.7"
            numOctaves="1"
            seed="23"
            result="grain"
          />
          <feColorMatrix
            in="grain"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  14 0 0 0 -9.2"
            result="specks"
          />
          <feComposite in="rough" in2="specks" operator="out" />
        </filter>
        <path id={`top-${uid}`} d={ARC_TOP} />
        <path id={`bottom-${uid}`} d={ARC_BOTTOM} />
      </defs>
      <g filter={`url(#ink-${uid})`}>
        <path d={STAMP_EDGE} strokeWidth="1.6" strokeLinejoin="round" />
        <circle cx="60" cy="60" r="51.8" strokeWidth="1.3" />
        <circle cx="60" cy="60" r="37" strokeWidth="1.3" />
        <g fill="currentColor" stroke="none">
          <path d={STAMP_STARS} />
          <path d={STAMP_MONOGRAM} />
          <text className="font-heading" fontSize="9.4" fontWeight="700" letterSpacing="1.6">
            <textPath href={`#top-${uid}`} startOffset="50%" textAnchor="middle">
              ПРОТОКОЛ
            </textPath>
          </text>
          <text className="font-heading" fontSize="7.6" fontWeight="700" letterSpacing="0.9">
            <textPath href={`#bottom-${uid}`} startOffset="50%" textAnchor="middle">
              ЦИФРОВОЙ ДЕКАНАТ
            </textPath>
          </text>
        </g>
      </g>
    </svg>
  );
}
