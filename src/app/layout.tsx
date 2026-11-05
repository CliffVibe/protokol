import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import { ConceptBanner } from "@/components/concept-banner";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F5F0" },
    { media: "(prefers-color-scheme: dark)", color: "#111315" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={cn(inter.variable, manrope.variable)}>
      <body className="flex min-h-dvh flex-col font-sans antialiased">
        <div className="flex-1">{children}</div>
        <footer className="mx-auto w-full max-w-[1120px] px-4 pb-6 md:px-6">
          <ConceptBanner />
        </footer>
      </body>
    </html>
  );
}
