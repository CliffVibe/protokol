// Только для серверных компонентов: читает выбор темы из cookie запроса.
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme, type ThemePreference } from "@/lib/theme";

export async function getThemePreference(): Promise<ThemePreference> {
  return parseTheme((await cookies()).get(THEME_COOKIE)?.value);
}
