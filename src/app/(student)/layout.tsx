// Оболочка студента: навигация, футер с плашкой концепта. Только оболочка —
// проверки доступа здесь НЕТ и быть не должно: layout не перерисовывается при клиентской навигации,
// guard requireStudent() вызывает каждая page (CLAUDE.md → «Железные правила», T03).
import { BrandMark } from "@/components/brand-mark";
import { LogoutButton } from "@/components/logout-button";
import { BottomNav } from "@/components/nav/bottom-nav";
import { HeaderBell } from "@/components/nav/header-bell";
import { PwaShell } from "@/components/pwa/pwa-shell";
import { SideNav } from "@/components/nav/side-nav";
import { SiteFooter } from "@/components/site-footer";
import { SkipLink } from "@/components/skip-link";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { getThemePreference } from "@/lib/theme-server";
import { optionalStudent } from "@/server/auth/guards";
import { unreadCountOf } from "@/server/repos/notifications";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  // Число непрочитанных — только для бейджа (T09). optionalStudent() не проверка доступа и не редиректит:
  // защищает requireStudent() в каждой page. Обновляется после «прочитано» — revalidatePath("/", "layout").
  const [theme, ctx] = await Promise.all([getThemePreference(), optionalStudent()]);
  const unreadCount = ctx ? await unreadCountOf(ctx) : 0;

  return (
    <div className="flex min-h-dvh">
      <SkipLink />

      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r border-line bg-bg px-4 py-5 lg:flex">
        <BrandMark href="/" subtitle="Цифровой деканат" className="px-1" />
        <div className="flex-1 overflow-y-auto">
          <SideNav unreadCount={unreadCount} />
        </div>
        <ThemeSwitcher value={theme} compact />
        <LogoutButton className="-mt-3" />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-bottom-nav lg:pb-0">
        {/* flex-wrap: при тексте 200% знак логотипа (rem) растёт, и колокольчик уходит вправо на вторую строку,
            а не за край экрана */}
        <header className="flex flex-wrap items-center justify-between gap-x-2 border-b border-line bg-bg px-4 lg:hidden">
          <BrandMark href="/" className="h-14" />
          <HeaderBell unreadCount={unreadCount} />
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

      <BottomNav unreadCount={unreadCount} />
      {/* PWA (T11): service worker и офлайн-плашка — оболочка, не проверка доступа */}
      <PwaShell />
    </div>
  );
}
