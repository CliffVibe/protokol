import type { Metadata, Viewport } from "next";
import { Onest, Unbounded } from "next/font/google";
import { themeClass, themeColorFor } from "@/lib/theme";
import { getThemePreference } from "@/lib/theme-server";
import { cn } from "@/lib/utils";
import "./globals.css";

// Шрифты Б′ (решение человека 10.11, docs/04-design.md): Unbounded — заголовки и крупные цифры,
// Onest — весь текст. Обе — OFL, полная кириллица; self-host через next/font (без запросов к Google в рантайме).
// Onest — переменный (один файл на подмножество вместо четырёх начертаний 400–700).
// Unbounded — только 600: заголовки всегда semibold (globals.css), жирнее нам не нужно.
// PDF справки остаётся на PT Sans / PT Serif (assets/fonts): документ — бланк.
const onest = Onest({
  subsets: ["latin", "cyrillic"],
  variable: "--font-text",
});
const unbounded = Unbounded({
  subsets: ["latin", "cyrillic"],
  weight: ["600"],
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
    <html lang="ru" className={cn(onest.variable, unbounded.variable, themeClass(theme))}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
