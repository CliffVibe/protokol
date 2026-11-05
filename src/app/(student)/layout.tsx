// Оболочка студента: навигация, футер с плашкой концепта. Только оболочка —
// проверки доступа здесь НЕТ и быть не должно: layout не перерисовывается при клиентской навигации,
// guard requireStudent() вызывает каждая page (CLAUDE.md → «Железные правила», T03).
import { BrandMark } from "@/components/brand-mark";
import { BottomNav } from "@/components/nav/bottom-nav";
import { SideNav } from "@/components/nav/side-nav";
import { SiteFooter } from "@/components/site-footer";
import { SkipLink } from "@/components/skip-link";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { getThemePreference } from "@/lib/theme-server";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const theme = await getThemePreference();
  // TODO(T09): число непрочитанных из уведомлений текущего студента (через ctx, не из layout-проверки).
  const unreadCount = 0;

  return (
    <div className="flex min-h-dvh">
      <SkipLink />

      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r border-line bg-bg px-4 py-5 lg:flex">
        <BrandMark href="/" subtitle="Цифровой деканат" className="px-1" />
        <div className="flex-1 overflow-y-auto">
          <SideNav unreadCount={unreadCount} />
        </div>
        <ThemeSwitcher value={theme} compact />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-bottom-nav lg:pb-0">
        <header className="border-b border-line bg-bg px-4 lg:hidden">
          <BrandMark href="/" className="h-14" />
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
    </div>
  );
}
