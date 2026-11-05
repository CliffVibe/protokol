// Пункты навигации студента (docs/04-design.md → «Навигация»).
// Мобильный: 5 пунктов внизу, «Ещё» собирает остальное. Десктоп: все пункты слева плоским списком.
import type { Route } from "next";
import {
  BookOpen,
  Bot,
  CalendarDays,
  Bell,
  FileText,
  House,
  Menu,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: Route;
  label: string;
  icon: LucideIcon;
  /** Показывать бейдж непрочитанных. */
  badge?: boolean;
};

export const NOW: NavItem = { href: "/", label: "Сейчас", icon: House };
export const SCHEDULE: NavItem = { href: "/schedule", label: "Расписание", icon: CalendarDays };
export const GRADES: NavItem = { href: "/grades", label: "Учёба", icon: BookOpen };
export const REQUESTS: NavItem = { href: "/requests", label: "Заявки", icon: FileText };
export const NOTIFICATIONS: NavItem = {
  href: "/notifications",
  label: "Уведомления",
  icon: Bell,
  badge: true,
};
export const PROFILE: NavItem = { href: "/profile", label: "Профиль", icon: UserRound };
export const ASSISTANT: NavItem = { href: "/assistant", label: "Помощник", icon: Bot };

/** Что прячется за «Ещё» на мобильном. */
export const MORE_ITEMS: NavItem[] = [NOTIFICATIONS, PROFILE, ASSISTANT];

export const MORE: NavItem = { href: "/more", label: "Ещё", icon: Menu, badge: true };

/** Нижняя панель (мобильный): Сейчас · Расписание · Учёба · Заявки · Ещё. */
export const BOTTOM_NAV: NavItem[] = [NOW, SCHEDULE, GRADES, REQUESTS, MORE];

/** Боковая панель (≥ 1024): те же разделы без «Ещё». */
export const SIDE_NAV: NavItem[] = [NOW, SCHEDULE, GRADES, REQUESTS, ...MORE_ITEMS];

/** Активен ли пункт для текущего пути. «Сейчас» — только точное совпадение, «Ещё» — и его подпункты. */
export function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  const matches = (href: Route) => pathname === href || pathname.startsWith(`${href}/`);
  if (item.href === MORE.href) return [MORE, ...MORE_ITEMS].some((i) => matches(i.href));
  return matches(item.href);
}
