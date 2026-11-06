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
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="border-b border-line bg-bg">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 md:px-6">
          {/* На телефоне три строки: логотип и «Выйти»; разделы (без значков); «Сбросить демо» и тема.
              На ≥ 768 — всё в одну строку, «Выйти» — в конце. Две кнопки «Выйти» в DOM, но видна всегда одна
              (вторая — display:none, скринридер её не видит). Порядок в DOM совпадает с визуальным (ux-reviewer T09:
              было 5 строк и 36% экрана на 360). */}
          <div className="flex w-full flex-wrap items-center justify-between gap-x-2 md:w-auto">
            <BrandMark href="/staff" subtitle="Кабинет деканата" />
            <LogoutButton className="md:hidden" />
          </div>
          <StaffNav />
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
            {/* «Сбросить демо» — только при DEMO_MODE=1; действие само проверяет роль и режим */}
            {isDemoMode() ? <ResetDemo /> : null}
            <ThemeSwitcher value={theme} compact className="w-[9.5rem]" />
            <LogoutButton className="hidden md:block" />
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
      <SiteFooter />
    </div>
  );
}
