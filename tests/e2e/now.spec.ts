// Главная «Сейчас» (T05): сценарий 1 «Утро», пустые состояния, изоляция, скорость.
// Алиса — сессия по умолчанию (setup); Тимур и Вера — демо-вход в отдельном контексте.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { ANON } from "./helpers/auth";

async function asDemo(browser: Browser, name: "Тимур" | "Вера"): Promise<Page> {
  const ctx = await browser.newContext({ storageState: ANON });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: `Войти как ${name}` }).click();
  await expect(page).toHaveURL(/\/$/);
  return page;
}

const REQUEST_NUMBER = /С-\d{4}-\d{5}/g;

/** Лента загружена (а не skeleton): иначе проверка «не содержит» прошла бы на пустой странице. */
async function feedLoaded(page: Page, firstName: string) {
  await expect(
    page.getByRole("heading", { level: 1, name: new RegExp(`, ${firstName}$`) }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Мои заявки" })).toBeVisible();
}

test.describe("«Сейчас» у Алисы (сценарий 1)", () => {
  test("приветствие, ближайшая пара, перенос и «Готова — заберите»", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: /, Алиса$/ })).toBeVisible();
    await expect(page.getByRole("article", { name: /пара|Идёт сейчас/ })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Изменения" }).getByText("Перенос"),
    ).toBeVisible();
    await expect(page.getByText("Готова — заберите")).toBeVisible();
    await expect(page.getByText("Стипендия сохраняется")).toBeVisible();
  });

  for (const [link, path] of [
    ["Все заявки", "/requests"],
    ["Расписание", "/schedule"],
    ["Успеваемость", "/grades"],
    ["Все объявления", "/notifications"],
  ] as const) {
    test(`блок ведёт в раздел за 1 касание: «${link}» → ${path}`, async ({ page }) => {
      await page.goto("/");
      await page.getByRole("main").getByRole("link", { name: link, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
    });
  }

  test("на десктопе колонка «Сегодня» справа от заявок", async ({ page, isMobile }) => {
    test.skip(isMobile, "только ≥ 1024");
    await page.goto("/");
    const today = await page.getByRole("region", { name: "Сегодня" }).boundingBox();
    const requests = await page.getByRole("region", { name: "Мои заявки" }).boundingBox();
    expect(today!.x).toBeGreaterThan(requests!.x + requests!.width - 1);
  });
});

test("Вера: аккуратные пустые состояния, без чужих данных", async ({ browser }) => {
  const page = await asDemo(browser, "Вера");
  await feedLoaded(page, "Вера");
  await expect(page.getByRole("heading", { level: 1, name: /, Вера$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Заявок пока нет" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Заказать справку" })).toBeVisible();
  await expect(page.getByText("Оценок пока нет")).toBeVisible();
  expect(await page.getByRole("main").innerText()).not.toMatch(REQUEST_NUMBER);
});

test("изоляция: Тимур не видит номера заявок Алисы", async ({ page, browser }) => {
  // Номера берём из ленты самой Алисы, а не из сида (security-ревью T02)
  await page.goto("/");
  await feedLoaded(page, "Алиса");
  const alisaNumbers = (await page.getByRole("main").innerText()).match(REQUEST_NUMBER) ?? [];
  expect(alisaNumbers.length).toBeGreaterThan(0);

  const timur = await asDemo(browser, "Тимур");
  await feedLoaded(timur, "Тимур");
  const timurText = await timur.getByRole("main").innerText();
  for (const n of alisaNumbers) expect(timurText).not.toContain(n);
  expect(timurText).not.toContain("Алиса");
  await expect(timur.getByText("Стипендия под угрозой")).toBeVisible();
});

test("LCP < 2,5 с на эмуляции телефона (CPU ×4, медленный 4G)", async ({ page, isMobile }) => {
  test.skip(!isMobile, "замер — в проекте mobile-360");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await page.goto("/", { waitUntil: "load" });
  const lcp = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let last = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) last = e.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
        setTimeout(() => resolve(last), 1500);
      }),
  );
  test.info().annotations.push({ type: "LCP, мс", description: String(Math.round(lcp)) });
  expect(lcp).toBeGreaterThan(0);
  expect(lcp).toBeLessThan(2500);
});
