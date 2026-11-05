import Link from "next/link";
import type { Route } from "next";
import { LogoSeal } from "@/components/logo-seal";
import { cn } from "@/lib/utils";

// Печать + название. Ссылка на главную оболочки; печать декоративная — название и так прочитается.
export function BrandMark({
  href,
  subtitle,
  className,
}: {
  href: Route;
  subtitle?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("inline-flex min-h-11 items-center gap-2.5 rounded-lg pr-2", className)}
    >
      <LogoSeal className="size-9" />
      <span className="flex flex-col leading-tight">
        <span className="font-heading text-lg font-bold">Протокол</span>
        {subtitle ? <span className="text-xs text-ink-muted">{subtitle}</span> : null}
      </span>
    </Link>
  );
}
