// Отчёт для жюри (T14): docs/report/report.html → docs/report/protokol-report.pdf.
// Печатает Chromium из набора Playwright; шрифты Unbounded и Onest грузятся с Google Fonts и встраиваются в PDF.
// node scripts/build-report.mjs [--executable <путь к chrome>]
import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { statSync } from "node:fs";

const html = resolve("docs/report/report.html");
const pdf = resolve("docs/report/protokol-report.pdf");
const exeIdx = process.argv.indexOf("--executable");
const executablePath = exeIdx > 0 ? process.argv[exeIdx + 1] : undefined;

const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(html).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  // Все картинки загрузились — иначе в PDF были бы пустые рамки
  const broken = await page.$$eval("img", (imgs) =>
    imgs.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute("src")),
  );
  if (broken.length) throw new Error(`Не загрузились картинки:\n${broken.join("\n")}`);
  await page.pdf({
    path: pdf,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate:
      '<div style="width:100%;font:8px sans-serif;color:#555a78;padding:0 15mm;display:flex;justify-content:space-between">' +
      "<span>«Протокол» — концепт для конкурса. Не является официальным сервисом МГИМО.</span>" +
      '<span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  });
  console.log(`PDF: ${pdf} (${Math.round(statSync(pdf).size / 1024)} КБ)`);
} finally {
  await browser.close();
}
