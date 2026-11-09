import { LogoMark } from "@/components/logo-mark";
import { SkipLink } from "@/components/skip-link";
import { SiteFooter } from "@/components/site-footer";

// Оболочка публичной проверки справки (T10): без навигации кабинета и без входа — её открывает
// посольство или работодатель по QR. Проверки доступа здесь нет и не нужно: страница показывает
// только то, что разрешает S7. Плашка концепта — в футере (CLAUDE.md → «Маркировка концепта»).
export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="border-b border-line bg-bg px-4 md:px-6">
        {/* Шапка — по ширине колонки документа: на 1280 знак не «висит» слева от справки (ux-reviewer, T13) */}
        <div className="mx-auto flex min-h-14 w-full max-w-2xl items-center gap-2.5">
          <LogoMark className="size-9" />
          <span className="flex flex-col leading-tight">
            <span className="font-heading text-base font-semibold text-ink">Протокол</span>
            <span className="text-xs text-ink-muted">
              Проверка справки <span lang="en">/ Certificate check</span>
            </span>
          </span>
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-[1120px] flex-1 px-4 pt-8 pb-10 outline-none md:px-6 lg:pt-14"
      >
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
