import type { Metadata, Viewport } from "next";
import { PT_Sans, PT_Serif } from "next/font/google";
import { themeClass, themeColorFor } from "@/lib/theme";
import { getThemePreference } from "@/lib/theme-server";
import { cn } from "@/lib/utils";
import "./globals.css";

// Шрифты — из docs/04-design.md, палитра «Бланк»: PT Serif для заголовков, PT Sans для текста.
// Семейство ParaType с полноценной кириллицей, лицензия OFL; self-host через next/font (без запросов к Google в рантайме).
const ptSans = PT_Sans({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-text",
});
const ptSerif = PT_Serif({
  subsets: ["latin", "cyrillic"],
  weight: ["700"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: { default: "Протокол", template: "%s · Протокол" },
  description:
    "Цифровой деканат: расписание, успеваемость, справки и уведомления. Концепт для конкурса.",
  robots: { index: false, follow: false },
};

export async function generateViewport(): Promise<Viewport> {
  return {
    width: "device-width",
    initialScale: 1,
    // viewportFit: cover — чтобы нижняя навигация могла отступить на safe-area iPhone
    viewportFit: "cover",
    themeColor: themeColorFor(await getThemePreference()),
  };
}

// Класс темы ставится на сервере по cookie: первый кадр сразу в выбранной теме (src/lib/theme.ts).
// Плашка концепта — в оболочках (SiteFooter) и на странице входа, а не здесь.
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const theme = await getThemePreference();
  return (
    <html lang="ru" className={cn(ptSans.variable, ptSerif.variable, themeClass(theme))}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
