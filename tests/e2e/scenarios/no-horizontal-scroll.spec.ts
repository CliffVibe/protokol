// Горизонтальный скролл на каждой странице (T13 часть Б, после дизайна Б′ — Unbounded/Onest, новая палитра):
// текст 100% и 200% × тема светлая и тёмная (cookie theme, как ставит переключатель). Критерий —
// document.documentElement.scrollWidth > clientWidth (ширина layout viewport). Не innerWidth: при isMobile
// Chromium отдаляет страницу под широкий контент, innerWidth растёт вместе со scrollWidth (проверено:
// блок 600px на 360 даёт 616 = 616), и проверка по innerWidth на телефоне не падает никогда.
// На падении — скриншот и список элементов,
// которые вылезли за правый край (в отчёт и в аннотации теста), трасса — по конфигу.
// shell.spec.ts и профильные spec проверяют часть страниц в светлой теме; здесь — полная матрица,
// включая чужие роли (Тимур с долгом, «пустая» Вера, сотрудник, аноним на /login и /verify).
// БД не трогает: номера и токен берутся из самих страниц (токен /verify — из PDF Алисы).
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { STORAGE } from "../../../playwright.config";
import { addDays, formatIsoWeek, mskDateKey, mskStartOfWeek } from "../../../src/lib/msk";
import { pdfTextVariants } from "../../unit/pdf-text";
import { ANON } from "../helpers/auth";
import { setTextScale } from "../helpers/text-scale";

test.use({ screenshot: "only-on-failure" });

type Who = "alisa" | "irina" | "timur" | "vera" | "anon";
type Case = {
  name: string;
  who: Who;
  /** Адрес или шаги, которые приводят к нужному виду (выполняются заново в каждой теме). */
  open: string | ((page: Page) => Promise<void>);
};

const THURSDAY = mskDateKey(addDays(mskStartOfWeek(new Date()), 3));
const WEEK = `/schedule?week=${formatIsoWeek(new Date())}`;

/** Первая ссылка в main, у которой href подходит под шаблон — номер берём со страницы, не из сида. */
async function gotoFirstLink(page: Page, from: string, selector: string) {
  await page.goto(from);
  const href = await page.locator(selector).first().getAttribute("href");
  expect(href, `на ${from} есть ссылка ${selector}`).toBeTruthy();
  await page.goto(href!);
}

/** Готовая заявка Алисы: мятный блок «Готова» с кнопкой PDF. */
async function alisaReadyRequest(page: Page) {
  await page.goto("/requests");
  const row = page
    .getByRole("list", { name: "Активные заявки" })
    .getByRole("listitem")
    .filter({ hasText: /Готова/ })
    .first();
  await page.goto((await row.getByRole("link").first().getAttribute("href"))!);
  await expect(page.getByRole("link", { name: "Скачать справку (PDF)" })).toBeVisible();
}

let verifyPath: string | undefined;
/** Адрес проверки по QR — из PDF готовой справки Алисы (как его получит посольство). */
async function verifyFromPdf(browser: Browser): Promise<string> {
  if (verifyPath) return verifyPath;
  const ctx = await browser.newContext({ storageState: STORAGE.alisa });
  const page = await ctx.newPage();
  await alisaReadyRequest(page);
  const href = await page.getByRole("link", { name: "Скачать справку (PDF)" }).getAttribute("href");
  const pdf = await (await page.request.get(href!)).body();
  await ctx.close();
  const token = pdfTextVariants(pdf)
    .map((t) => /\/verify\/([A-Za-z0-9_-]{22})/.exec(t)?.[1])
    .find(Boolean);
  expect(token, "в PDF есть ссылка /verify/<токен>").toBeTruthy();
  verifyPath = `/verify/${token}`;
  return verifyPath;
}

const CASES: Case[] = [
  // ── без входа
  { name: "/login", who: "anon", open: "/login" },
  { name: "/verify/<токен> (из PDF)", who: "anon", open: "verify" },
  { name: "/verify/<нет такой> — 404", who: "anon", open: `/verify/${"A".repeat(22)}` },
  // ── Алиса: каждый раздел и его виды
  { name: "/ (Алиса)", who: "alisa", open: "/" },
  { name: "/schedule", who: "alisa", open: "/schedule" },
  { name: "/schedule?week=", who: "alisa", open: WEEK },
  { name: "/schedule?day=<четверг>", who: "alisa", open: `/schedule?day=${THURSDAY}` },
  {
    name: "/schedule?week= + лист пары",
    who: "alisa",
    open: async (page) => {
      await page.goto(WEEK);
      await page
        .getByRole("list", { name: /^Пары: / })
        .getByRole("listitem")
        .filter({ hasText: "Перенос" })
        .getByRole("button")
        .first()
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
    },
  },
  { name: "/grades (Алиса)", who: "alisa", open: "/grades" },
  { name: "/grades/dsc-tmo", who: "alisa", open: "/grades/dsc-tmo" },
  { name: "/grades?semester=2 (закрытый)", who: "alisa", open: "/grades?semester=2" },
  { name: "/requests (Алиса)", who: "alisa", open: "/requests" },
  { name: "/requests/<готовая> (Алиса)", who: "alisa", open: alisaReadyRequest },
  { name: "/requests/new", who: "alisa", open: "/requests/new" },
  { name: "/requests/new?purpose=visa", who: "alisa", open: "/requests/new?purpose=visa" },
  {
    name: "/requests/new?purpose=visa&type=embassy",
    who: "alisa",
    open: "/requests/new?purpose=visa&type=embassy",
  },
  {
    name: "/requests/new?…&lang=en (форма)",
    who: "alisa",
    open: "/requests/new?purpose=visa&type=embassy&lang=en",
  },
  { name: "/requests/new?all=1", who: "alisa", open: "/requests/new?all=1" },
  { name: "/requests/new?type=military", who: "alisa", open: "/requests/new?type=military" },
  {
    name: "/requests/new?type=military + ошибки формы",
    who: "alisa",
    open: async (page) => {
      await page.goto("/requests/new?type=military");
      await page.getByRole("button", { name: "Отправить заявку" }).click();
      await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible();
    },
  },
  { name: "/notifications", who: "alisa", open: "/notifications" },
  {
    name: "/notifications?tab=announcements",
    who: "alisa",
    open: "/notifications?tab=announcements",
  },
  { name: "/notifications?tab=requests", who: "alisa", open: "/notifications?tab=requests" },
  { name: "/more", who: "alisa", open: "/more" },
  { name: "/profile", who: "alisa", open: "/profile" },
  { name: "/assistant", who: "alisa", open: "/assistant" },
  {
    name: "/assistant + ответ",
    who: "alisa",
    open: async (page) => {
      await page.goto("/assistant");
      await page.getByRole("button", { name: "Когда следующий экзамен?" }).click();
      await expect(page.getByRole("log", { name: "Разговор с помощником" })).toHaveAttribute(
        "aria-busy",
        "false",
      );
    },
  },
  { name: "/no-such-page (404)", who: "alisa", open: "/no-such-page" },
  // ── Тимур: долг, «под угрозой», отклонённая заявка
  { name: "/ (Тимур)", who: "timur", open: "/" },
  { name: "/grades (Тимур)", who: "timur", open: "/grades" },
  {
    name: "/grades/<долг> (Тимур)",
    who: "timur",
    open: (page) => gotoFirstLink(page, "/grades", 'main a:has-text("Долг: ")'),
  },
  { name: "/requests (Тимур)", who: "timur", open: "/requests" },
  {
    name: "/requests/<отклонённая> (Тимур)",
    who: "timur",
    open: (page) =>
      gotoFirstLink(page, "/requests", 'main [aria-label="Архив заявок"] a[href^="/requests/"]'),
  },
  // ── Вера: пустые состояния
  { name: "/ (Вера)", who: "vera", open: "/" },
  { name: "/grades (Вера)", who: "vera", open: "/grades" },
  { name: "/requests (Вера)", who: "vera", open: "/requests" },
  { name: "/notifications (Вера)", who: "vera", open: "/notifications" },
  // ── Сотрудник
  { name: "/staff", who: "irina", open: "/staff" },
  {
    name: "/staff/requests/<номер>",
    who: "irina",
    open: (page) => gotoFirstLink(page, "/staff", 'main a[href^="/staff/requests/"]'),
  },
  { name: "/staff/announcements", who: "irina", open: "/staff/announcements" },
  { name: "/staff/schedule", who: "irina", open: "/staff/schedule" },
];

async function contextFor(browser: Browser, who: Who): Promise<BrowserContext> {
  if (who === "alisa") return browser.newContext({ storageState: STORAGE.alisa });
  if (who === "irina") return browser.newContext({ storageState: STORAGE.irina });
  const ctx = await browser.newContext({ storageState: ANON });
  if (who === "anon") return ctx;
  const page = await ctx.newPage();
  await page.goto("/login");
  await page
    .getByRole("button", { name: `Войти как ${who === "timur" ? "Тимур" : "Вера"}` })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await page.close();
  return ctx;
}

/** Сколько пикселей лишних и какие элементы вылезли за правый край (без тех, что обрезает предок). */
async function measure(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const overflow = document.documentElement.scrollWidth - vw;
    const clipped = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox !== "visible") return p.getBoundingClientRect().right <= vw + 0.5;
      }
      return false;
    };
    const offenders: string[] = [];
    if (overflow > 0) {
      for (const el of Array.from(document.body.querySelectorAll("*"))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.right <= vw + 0.5 || clipped(el)) continue;
        // Самые глубокие: у элемента нет вылезающих детей
        const childOut = Array.from(el.children).some(
          (c) => c.getBoundingClientRect().right > vw + 0.5,
        );
        if (childOut) continue;
        const cls = (el.getAttribute("class") ?? "").split(/\s+/).slice(0, 4).join(".");
        const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
        offenders.push(
          `<${el.tagName.toLowerCase()}${cls ? "." + cls : ""}> right=${Math.round(r.right)} «${text}»`,
        );
        if (offenders.length >= 6) break;
      }
    }
    return { overflow, scrollWidth: document.documentElement.scrollWidth, vw, offenders };
  });
}

for (const c of CASES) {
  test(`${c.name}: 100% и 200% текста, светлая и тёмная — без скролла вбок`, async ({
    browser,
    baseURL,
  }, testInfo) => {
    const ctx = await contextFor(browser, c.who);
    const page = await ctx.newPage();
    const problems: string[] = [];
    try {
      for (const theme of ["light", "dark"] as const) {
        await ctx.addCookies([{ name: "theme", value: theme, url: baseURL! }]);
        if (c.open === "verify") await page.goto(await verifyFromPdf(browser));
        else if (typeof c.open === "string") await page.goto(c.open);
        else await c.open(page);
        await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

        for (const scale of ["100%", "200%"]) {
          await setTextScale(page, scale);
          const m = await measure(page);
          if (m.overflow > 0) {
            const label = `${theme}, текст ${scale}: scrollWidth ${m.scrollWidth} > clientWidth ${m.vw} (+${m.overflow}px)`;
            problems.push(`${label}\n    ${m.offenders.join("\n    ") || "(виновник не найден)"}`);
            testInfo.annotations.push({ type: "overflow", description: label });
            await testInfo.attach(`${theme}-${scale}.png`, {
              body: await page.screenshot({ fullPage: false }),
              contentType: "image/png",
            });
          }
        }
        await setTextScale(page, "");
      }
    } finally {
      await ctx.close();
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });
}

test("контроль: проверка ловит блок шире экрана (иначе вся матрица зелёная вслепую)", async ({
  browser,
}) => {
  const ctx = await contextFor(browser, "anon");
  const page = await ctx.newPage();
  await page.goto("/login");
  expect((await measure(page)).overflow).toBeLessThanOrEqual(0);
  await page.evaluate(() => {
    const wide = document.createElement("div");
    wide.style.cssText = "width: calc(100vw + 240px); height: 1px";
    document.querySelector("main")!.append(wide);
  });
  const m = await measure(page);
  expect(m.overflow).toBeGreaterThan(0);
  expect(m.offenders.join("\n")).toContain("<div");
  await ctx.close();
});
