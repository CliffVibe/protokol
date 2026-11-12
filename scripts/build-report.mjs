// Отчёт для жюри (T14): docs/report/report.html → docs/report/protokol-report.pdf.
// Печатает Chromium из набора Playwright; шрифты Unbounded и Onest грузятся с Google Fonts и встраиваются в PDF.
// Цифры процесса не вписаны в HTML руками: элементы с data-metric="…" заполняются перед печатью из
// scripts/ai-metrics.mjs (git и docs/process) и docs/report/test-run.json (scripts/record-test-run.mjs).
// Неизвестный ключ — ошибка сборки, а не пустое место в PDF.
// node scripts/build-report.mjs [--executable <путь к chrome>]
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { readFileSync, statSync } from "node:fs";

const m = JSON.parse(
  execFileSync(process.execPath, ["scripts/ai-metrics.mjs", "--json"], { encoding: "utf8" }),
);
const run = JSON.parse(readFileSync("docs/report/test-run.json", "utf8"));
const caught = m.process.caughtBy;
const fmt = (n) => n.toLocaleString("ru-RU");
const days = Math.round((Date.parse(m.git.to) - Date.parse(m.git.from)) / 86_400_000) + 1;
/** Ключ → текст. Добавляешь data-metric в отчёт — добавь ключ сюда. */
const METRICS = {
  commits: fmt(m.git.commits),
  days: fmt(days),
  dateFrom: new Date(m.git.from).toLocaleDateString("ru-RU", { day: "numeric" }),
  dateTo: new Date(m.git.to).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }),
  aiErrors: fmt(m.process.aiErrors),
  caughtTests: fmt(caught["тесты (unit, e2e, CI)"]),
  caughtSelf: fmt(caught["ИИ сам"]),
  caughtAgents: fmt(caught["субагенты и ревью"]),
  caughtHuman: fmt(caught["человек"]),
  caughtHook: fmt(caught["хук-охранник"]),
  journalEntries: fmt(m.process.journalEntries),
  manualMarks: fmt(m.process.manualMarks),
  screenshots: fmt(m.process.screenshots),
  srcThousands: fmt(Math.round(m.code.srcLines / 1000)),
  unitTests: fmt(m.tests.unit + m.tests.integration),
  e2eTests: fmt(m.tests.e2e),
  guardTests: fmt(m.tests.guardHook),
  vitestPassed: fmt(run.vitest.passed),
  vitestFailed: fmt(run.vitest.failed),
  e2ePassed: fmt(run.e2e.passed),
  e2eFailed: fmt(run.e2e.failed),
  testRunDate: new Date(run.date).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }),
};
// Полосы «кто поймал»: ширина пропорциональна числу (макс. 80 мм)
const caughtMax = Math.max(...Object.values(caught));
const BARS = Object.fromEntries(
  [
    ["caughtTests", "тесты (unit, e2e, CI)"],
    ["caughtSelf", "ИИ сам"],
    ["caughtAgents", "субагенты и ревью"],
    ["caughtHuman", "человек"],
    ["caughtHook", "хук-охранник"],
  ].map(([k, label]) => [k, `${Math.max(2, Math.round((caught[label] / caughtMax) * 80))}mm`]),
);

const html = resolve("docs/report/report.html");
const pdf = resolve("docs/report/protokol-report.pdf");
const exeIdx = process.argv.indexOf("--executable");
const executablePath = exeIdx > 0 ? process.argv[exeIdx + 1] : undefined;

const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(html).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const missing = await page.evaluate(
    ({ metrics, bars }) => {
      const unknown = [];
      for (const el of document.querySelectorAll("[data-metric]")) {
        const key = el.getAttribute("data-metric");
        if (key in metrics) el.textContent = metrics[key];
        else unknown.push(key);
      }
      for (const el of document.querySelectorAll("[data-bar]")) {
        const key = el.getAttribute("data-bar");
        if (key in bars) el.style.width = bars[key];
        else unknown.push(`bar:${key}`);
      }
      return unknown;
    },
    { metrics: METRICS, bars: BARS },
  );
  if (missing.length) throw new Error(`Нет значений для data-metric: ${missing.join(", ")}`);
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
