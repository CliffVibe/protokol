// Оболочка кабинета сотрудника деканата: десктоп-первая, но рабочая на телефоне.
// Проверки доступа здесь НЕТ: requireStaff() вызывает каждая page (CLAUDE.md, T03).
import { BrandMark } from "@/components/brand-mark";
import { LogoutButton } from "@/components/logout-button";
import { SiteFooter } from "@/components/site-footer";
import { SkipLink } from "@/components/skip-link";
import { ResetDemo } from "@/components/staff/reset-demo";
import { StaffIdentity } from "@/components/staff/staff-identity";
import { StaffNav } from "@/components/staff/staff-nav";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { getThemePreference } from "@/lib/theme-server";
import { optionalStaff } from "@/server/auth/guards";
import { staffIdentity } from "@/server/repos/staff-profile";
import { isDemoMode } from "@/server/services/auth";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  // Кто вошёл — для шапки и «Профиля» (T13). optionalStaff() не проверка доступа и не редиректит:
  // страницу защищает requireStaff() в каждой page
  const [theme, ctx] = await Promise.all([getThemePreference(), optionalStaff()]);
  const who = ctx ? await staffIdentity(ctx) : null;
  // «Сбросить демо» — только при DEMO_MODE=1; действие само проверяет роль и режим
  const demo = isDemoMode();
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="border-b border-line bg-bg">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 md:px-6">
          {/* На телефоне две строки: логотип и «Выйти»; разделы (без значков). На ≥ 768 — одна строка:
              знак, разделы, кто вошёл (≥ 1024) и «Выйти». Тема и «Сбросить демо» — на всех ширинах в блоке
              «Профиль» внизу страницы, над плашкой концепта: их трогают редко, а с ФИО в шапке (T13, «нигде не
              написано, что это аккаунт Ирины») шапка десктопа разъезжалась в две строки.
              Второй «Выйти» в DOM — display:none, скринридер его не видит. */}
          <div className="flex w-full flex-wrap items-center justify-between gap-x-2 md:w-auto">
            <BrandMark href="/staff" subtitle="Кабинет деканата" />
            <LogoutButton className="md:hidden" />
          </div>
          <StaffNav />
          <div className="ml-auto hidden min-w-0 items-center justify-end gap-4 md:flex">
            {/* ФИО в шапке — с 1280: на 1024 с четырьмя разделами шапка не помещалась в строку (T14+).
                Ширину не ужимать: подпись «Сотрудник деканата ФМО и МЭО» переносится и шапка растёт (замер T14+) */}
            {who ? <StaffIdentity who={who} className="hidden max-w-60 xl:flex" /> : null}
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
        className="mx-auto mt-10 flex w-full max-w-[1120px] flex-col items-start gap-4 border-t border-line px-4 pt-6 md:px-6"
      >
        <h2 id="staff-settings-title" className="text-lg text-ink">
          Профиль
        </h2>
        {who ? <StaffIdentity who={who} /> : null}
        <ThemeSwitcher value={theme} className="w-full max-w-80" />
        {demo ? <ResetDemo variant="outline" /> : null}
      </section>
      <SiteFooter />
    </div>
  );
}
