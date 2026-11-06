import Link from "next/link";
import {
  BriefcaseBusiness,
  FileText,
  GraduationCap,
  HeartHandshake,
  Plane,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { PURPOSES, wizardHref, type PurposeCode } from "@/lib/request-wizard";

const ICON: Record<PurposeCode, LucideIcon> = {
  visa: Plane,
  military: Shield,
  work: BriefcaseBusiness,
  social: HeartHandshake,
  internship: GraduationCap,
  other: FileText,
};

// PurposePicker (04-design): сетка целей. Колонки — по ширине в rem: 9.5rem — две колонки и на 360,
// а при тексте 200% сетка сама уходит в одну, а не сжимает подписи; на ≥ 1024 — ровно 3×2, без дыры
// справа (ux-reviewer, T10). Плитка — ссылка целиком (касание ≥ 44px).
export function PurposePicker() {
  return (
    <ul
      aria-label="Для чего нужна справка"
      className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3 lg:grid-cols-3"
    >
      {PURPOSES.map((p) => {
        const Icon = ICON[p.code];
        return (
          <li key={p.code} className="relative">
            <Link
              href={wizardHref({ purpose: p.code })}
              className="flex h-full min-h-[44px] flex-col gap-3 rounded-2xl border border-line bg-surface p-4 outline-none hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span
                aria-hidden
                className="flex size-[40px] items-center justify-center rounded-full bg-brand-soft text-brand"
              >
                <Icon className="size-[20px]" />
              </span>
              <span className="flex flex-col gap-1">
                <span className="text-lg font-bold break-words text-ink">{p.label}</span>
                <span className="text-sm text-ink-muted">{p.hint}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
