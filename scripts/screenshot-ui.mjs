// Скриншоты витрины и оболочки для отчёта жюри: docs/process/screenshots/04-T04-<экран>-<ширина>-<тема>.png
// Нужен запущенный `pnpm dev` (витрина /dev/ui в прод-сборке — 404).
// Запуск: node scripts/screenshot-ui.mjs [baseURL]   (по умолчанию http://localhost:3000)
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3000";
const out = "docs/process/screenshots";
mkdirSync(out, { recursive: true });

const VIEWPORTS = [
  { name: "360", width: 360, height: 740, isMobile: true },
  { name: "1280", width: 1280, height: 800, isMobile: false },
];
const PAGES = [
  { name: "ui", path: "/dev/ui", fullPage: true },
  { name: "now", path: "/", fullPage: false },
  { name: "more", path: "/more", fullPage: false },
  { name: "staff", path: "/staff", fullPage: false },
];

const browser = await chromium.launch();
try {
  for (const vp of VIEWPORTS) {
    for (const scheme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
        isMobile: vp.isMobile,
        hasTouch: vp.isMobile,
        colorScheme: scheme,
        locale: "ru-RU",
      });
      const page = await context.newPage();
      for (const p of PAGES) {
        await page.goto(base + p.path, { waitUntil: "networkidle" });
        // Значок dev-инструментов Next не нужен на скриншоте
        await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
        const file = `${out}/04-T04-${p.name}-${vp.name}-${scheme}.png`;
        await page.screenshot({ path: file, fullPage: p.fullPage });
        console.log(file);
      }
      if (vp.isMobile) {
        // Масштаб текста 200% (04-design → «Доступность»): навигация и «Ещё» не ломаются
        await page.goto(base + "/more", { waitUntil: "networkidle" });
        await page.addStyleTag({
          content: "html{font-size:200%!important}nextjs-portal{display:none!important}",
        });
        const file = `${out}/04-T04-more-${vp.name}-${scheme}-text200.png`;
        await page.screenshot({ path: file, fullPage: true });
        console.log(file);
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}
