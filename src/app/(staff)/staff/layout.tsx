// Оболочка кабинета сотрудника деканата: десктоп-первая, но рабочая на телефоне.
// Проверки доступа здесь НЕТ: requireStaff() вызывает каждая page (CLAUDE.md, T03).
import Link from "next/link";
import { Inbox } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { LogoutButton } from "@/components/logout-button";
import { SiteFooter } from "@/components/site-footer";
import { SkipLink } from "@/components/skip-link";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { getThemePreference } from "@/lib/theme-server";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const theme = await getThemePreference();
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="border-b border-line bg-bg">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 md:px-6">
          <div className="w-full md:w-auto">
            <BrandMark href="/staff" subtitle="Кабинет деканата" />
          </div>
          {/* TODO(T09): пункт «Объявления» вместе с маршрутом */}
          {/* На телефоне: логотип — первой строкой, разделы и тема — второй; на ≥ 768 — всё в одну.
              Порядок в DOM совпадает с визуальным — Tab идёт так же, как видно. */}
          <nav aria-label="Разделы кабинета" className="shrink-0">
            <ul className="flex flex-wrap gap-1">
              <li>
                <Link
                  href="/staff"
                  aria-current="page"
                  className="relative flex min-h-11 items-center gap-2 rounded-lg px-3 text-base font-semibold text-brand before:absolute before:inset-x-3 before:-bottom-2 before:h-[3px] before:rounded-t-full before:bg-brand forced-colors:before:bg-[CanvasText]"
                >
                  <Inbox aria-hidden className="size-5" />
                  Заявки
                </Link>
              </li>
            </ul>
          </nav>
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
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
      <SiteFooter />
    </div>
  );
}
