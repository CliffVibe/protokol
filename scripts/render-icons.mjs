// Значки PWA (T11) из src/app/icon.svg («Лист бланка», печать — фиолетовый --seal) — без новых зависимостей:
// рисует Chromium, который уже стоит для Playwright. Результат коммитим; скрипт — чтобы пересобрать
// после правки значка: `node scripts/render-icons.mjs`.
//   public/icons/icon-192.png, icon-512.png — обычные (прозрачный фон, как значок вкладки);
//   public/icons/maskable-512.png — для Android: лист в безопасной зоне 80 %, фон «бумаги» --bg;
//   src/app/apple-icon.png (180) — iPhone: Next сам ставит <link rel="apple-touch-icon">.
// Берём светлый вариант значка: тёмная тема рисуется из того же SVG через prefers-color-scheme.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");

const ROOT = join(import.meta.dirname, "..");
const PAPER = "#eef1ec"; // --bg светлой темы (globals.css)
const svg = readFileSync(join(ROOT, "src/app/icon.svg"), "utf8").replace(
  /@media \(prefers-color-scheme:dark\)\{.*?\}\}/,
  "",
);

const ICONS = [
  { file: "public/icons/icon-192.png", size: 192, padding: 0, background: "transparent" },
  { file: "public/icons/icon-512.png", size: 512, padding: 0, background: "transparent" },
  { file: "public/icons/maskable-512.png", size: 512, padding: 0.2, background: PAPER },
  { file: "src/app/apple-icon.png", size: 180, padding: 0.12, background: PAPER },
];

const browser = await chromium.launch();
try {
  for (const icon of ICONS) {
    const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } });
    const inner = Math.round(icon.size * (1 - 2 * icon.padding));
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:${icon.background}">` +
        `<div style="width:${icon.size}px;height:${icon.size}px;display:grid;place-items:center">` +
        svg.replace("<svg ", `<svg width="${inner}" height="${inner}" `) +
        `</div></body></html>`,
    );
    await page.screenshot({
      path: join(ROOT, icon.file),
      omitBackground: icon.background === "transparent",
    });
    await page.close();
    console.log(`${icon.file} — ${icon.size}px`);
  }
} finally {
  await browser.close();
}
