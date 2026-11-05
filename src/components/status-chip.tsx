import {
  CircleAlert,
  CircleCheck,
  CircleDot,
  CircleX,
  Clock,
  Stamp,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "brand" | "ok" | "warn" | "danger" | "seal";

// Цвет никогда не единственный носитель смысла: у каждого тона своя иконка, и всегда есть текст.
// Текст цветом тона на --surface — контраст ≥ 4.5:1 в обеих темах (tests/unit/contrast.test.ts).
// Тон seal — только для статуса «Выдана» (04-design).
const TONES: Record<StatusTone, { className: string; icon: LucideIcon }> = {
  neutral: { className: "border-line text-ink-muted", icon: CircleDot },
  brand: { className: "border-brand/40 text-brand", icon: Clock },
  ok: { className: "border-ok/40 text-ok", icon: CircleCheck },
  warn: { className: "border-warn/40 text-warn", icon: CircleAlert },
  danger: { className: "border-danger/40 text-danger", icon: CircleX },
  seal: { className: "border-seal/40 text-seal", icon: Stamp },
};

type StatusChipProps = {
  tone?: StatusTone;
  children: React.ReactNode;
  /** Своя иконка вместо иконки тона. */
  icon?: LucideIcon;
  className?: string;
};

export function StatusChip({ tone = "neutral", children, icon, className }: StatusChipProps) {
  const { className: toneClass, icon: ToneIcon } = TONES[tone];
  const Icon = icon ?? ToneIcon;
  return (
    <span
      data-tone={tone}
      className={cn(
        "inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full border bg-surface px-2.5 py-0.5 text-sm leading-tight font-medium",
        toneClass,
        className,
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 break-words">{children}</span>
    </span>
  );
}
