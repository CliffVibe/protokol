import type { LucideIcon } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { SiteFooter } from "@/components/site-footer";
import { SkipLink } from "@/components/skip-link";
import { cn } from "@/lib/utils";

type SystemPageProps = {
  /** «Ошибка 404» — тихая строка над заголовком: код нужен тому, кто пишет в поддержку, а не всем. */
  code: string;
  icon: LucideIcon;
  /** danger — сбой на нашей стороне; muted — «не нашли» (не тревога, а как «не найдена» на /verify). */
  tone: "muted" | "danger";
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
};

// Страницы 404 и 500 (T13) — вне оболочек кабинета: оболочки может не быть (упала или нет входа).
// Тот же язык, что у статусов /verify: черта слева 4px + значок 32px + h1. Шапка — знак и название,
// футер — плашка концепта (CLAUDE.md → «Маркировка концепта»). Клиентская: её рендерит и error.tsx.
export function SystemPage({ code, icon: Icon, tone, title, children, actions }: SystemPageProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="border-b border-line bg-bg px-4 md:px-6">
        <div className="mx-auto flex w-full max-w-[1120px]">
          <BrandMark href="/" className="h-14" />
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-[1120px] flex-1 px-4 pt-8 pb-10 outline-none md:px-6 lg:pt-14"
      >
        <div className="flex max-w-2xl flex-col gap-6">
          <section
            aria-labelledby="system-title"
            className={cn(
              "flex gap-4 border-l-4 py-1 pl-4",
              tone === "danger" ? "border-danger text-danger" : "border-ink-muted text-ink-muted",
            )}
          >
            <Icon aria-hidden className="mt-1 size-[32px] shrink-0" />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-sm text-ink-muted tabular">{code}</p>
              <h1
                id="system-title"
                className="text-xl break-words hyphens-auto text-ink [hyphenate-limit-chars:10_4_4] lg:text-2xl"
              >
                {title}
              </h1>
            </div>
          </section>
          {children ? (
            <div className="flex max-w-prose flex-col gap-2 text-base text-ink-muted">
              {children}
            </div>
          ) : null}
          {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
