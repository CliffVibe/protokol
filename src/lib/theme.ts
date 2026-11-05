// Тема интерфейса: выбор хранится в cookie, класс на <html> ставит сервер — поэтому
// первый кадр сразу в нужной теме, без мигания и без inline-скрипта (CSP, docs/05-security.md → S6).
// Cookie не секрет и не связана с сессией: её читает и пишет клиентский переключатель.
import type { Viewport } from "next";

export const THEME_COOKIE = "theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const THEME_PREFERENCES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** Значение --bg из globals.css: шапки на «бумаге», адресная строка сливается с ними
 *  (сверяет tests/unit/theme.test.ts). */
export const THEME_COLORS = { light: "#F7F5F0", dark: "#111315" } as const;

export function parseTheme(value: string | undefined): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

/** Класс для <html>: без класса — тема по prefers-color-scheme. */
export function themeClass(theme: ThemePreference): "light" | "dark" | undefined {
  return theme === "system" ? undefined : theme;
}

/** theme-color для адресной строки: выбранная тема — один цвет, системная — пара по media. */
export function themeColorFor(theme: ThemePreference): NonNullable<Viewport["themeColor"]> {
  if (theme !== "system") return THEME_COLORS[theme];
  return [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ];
}
