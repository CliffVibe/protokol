// Оболочка кабинета сотрудника деканата: десктоп-первая, но рабочая на телефоне.
// Проверки доступа здесь НЕТ: requireStaff() вызывает каждая page (CLAUDE.md, T03).
import { BrandMark } from "@/components/brand-mark";
import { LogoutButton } from "@/components/logout-button";
import { SiteFooter } from "@/components/site-footer";
import { SkipLink } from "@/components/skip-link";
import { ResetDemo } from "@/components/staff/reset-demo";
import { StaffNav } from "@/components/staff/staff-nav";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { getThemePreference } from "@/lib/theme-server";
import { isDemoMode } from "@/server/services/auth";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const theme = await getThemePreference();
  // «Сбросить демо» — только при DEMO_MODE=1; действие само проверяет роль и режим
  const demo = isDemoMode();
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="border-b border-line bg-bg">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 md:px-6">
          {/* На телефоне две строки: логотип и «Выйти»; разделы (без значков). Тема и «Сбросить демо» —
              блок «Настройки» внизу страницы, над плашкой концепта: их трогают редко, а шапка в три строки занимала ~165px
              (ревью T07–T08; до T09 было 5 строк). На ≥ 768 — всё в одну строку, «Выйти» в конце.
              Дубли в DOM (вторые «Выйти», тема, сброс) — display:none, скринридер их не видит. */}
          <div className="flex w-full flex-wrap items-center justify-between gap-x-2 md:w-auto">
            <BrandMark href="/staff" subtitle="Кабинет деканата" />
            <LogoutButton className="md:hidden" />
          </div>
          <StaffNav />
          <div className="ml-auto hidden min-w-0 flex-wrap items-center justify-end gap-2 md:flex">
            {demo ? <ResetDemo /> : null}
            <ThemeSwitcher value={theme} compact className="w-[9.5rem]" />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-[1120px] flex-1 px-4 pt-6 outline-none md:px-6 lg:pt-10"
      >
        {children}
      </main>
      <section
        aria-labelledby="staff-settings-title"
        className="mx-auto mt-10 flex w-full max-w-[1120px] flex-col items-start gap-4 border-t border-line px-4 pt-6 md:hidden"
      >
        <h2 id="staff-settings-title" className="text-lg font-bold text-ink">
          Настройки
        </h2>
        <ThemeSwitcher value={theme} className="w-full max-w-80" />
        {demo ? <ResetDemo variant="outline" /> : null}
      </section>
      <SiteFooter />
    </div>
  );
}
