import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import { themeClass, themeColorFor } from "@/lib/theme";
import { getThemePreference } from "@/lib/theme-server";
import { cn } from "@/lib/utils";
import "./globals.css";

// Шрифты — из docs/04-design.md: Manrope для заголовков, Inter для текста (обе OFL, self-host через next/font)
const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter" });
const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  weight: ["600", "700"],
  variable: "--font-manrope",
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
    <html lang="ru" className={cn(inter.variable, manrope.variable, themeClass(theme))}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
