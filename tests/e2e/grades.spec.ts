// Успеваемость (T07): «Как у меня дела», долг и стипендия у Тимура, семестры, детали дисциплины,
// изоляция по id дисциплины (S1: чужая → 404; общая — только свои баллы), 360px и текст 200%.
// Алиса — сессия по умолчанию (setup); Тимур и Вера — демо-вход в отдельном контексте.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { ANON } from "./helpers/auth";
import { setTextScale } from "./helpers/text-scale";

async function as(browser: Browser, who: "Тимур" | "Вера"): Promise<Page> {
  const ctx = await browser.newContext({ storageState: ANON });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: `Войти как ${who}` }).click();
  await expect(page).toHaveURL(/\/$/);
  return page;
}

const summary = (page: Page) => page.getByRole("region", { name: "Как у меня дела" });
const disciplines = (page: Page) => page.getByRole("list", { name: /^Дисциплины, / });

/** Страница загружена (не skeleton): иначе проверка «не содержит» прошла бы на пустой странице. */
async function gradesLoaded(page: Page) {
  await expect(summary(page)).toBeVisible();
  await expect(disciplines(page).getByRole("listitem").first()).toBeVisible();
}

/** id дисциплин текущего семестра — из ссылок самой страницы. */
async function disciplineIds(page: Page): Promise<string[]> {
  const hrefs = await disciplines(page)
    .getByRole("link")
    .evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
  return hrefs.map((h) => h.replace("/grades/", ""));
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test("приёмка: у Тимура виден долг и «Стипендия не назначена» с причинами — долг назван один раз", async ({
  browser,
}) => {
  const page = await as(browser, "Тимур");
  await page.goto("/grades");
  await gradesLoaded(page);
  const s = summary(page);
  await expect(s).toContainText("1 долг");
  await expect(s.getByRole("link", { name: "Долг: Эконометрика" })).toBeVisible();
  // С долгом стипендию уже не назначают — не «под угрозой» (T14)
  await expect(s).toContainText("Стипендия не назначена");
  const reasons = s.getByRole("list", { name: "Причины" });
  await expect(reasons).toContainText("Международные финансы: 54 из 100, нужно 60");
  // Долг уже назван выше ссылкой — в причинах без повтора названия
  await expect(reasons).toContainText("Есть долг — стипендию назначат после пересдачи");
  await expect(reasons).not.toContainText("Эконометрика");
  // Сессия текущего семестра — в январе: ближайший экзамен «Мировая экономика»
  await expect(s).toContainText(/Ближайшее в сессии — экзамен «Мировая экономика»/);
  // Пересдача долга — у самого долга, с днём недели и «через N дней»
  await expect(s).toContainText(
    /Пересдача — \S+, \d+ \S+, \d{2}:\d{2}, через \d+\s(день|дня|дней)/,
  );
});

test("Тимур: сначала проблемные — «Международные финансы» первой, «Ниже 60» и сколько не хватает", async ({
  browser,
}) => {
  const page = await as(browser, "Тимур");
  await page.goto("/grades");
  await gradesLoaded(page);
  const first = disciplines(page).getByRole("listitem").first();
  await expect(first).toContainText("Международные финансы");
  await expect(first).toContainText("Ниже 60");
  await expect(first).toContainText("Не хватает 6 баллов до 60");
  await expect(first.locator("[data-tone=warn] svg")).toBeVisible();
});

test("Алиса: стипендия сохраняется, долгов нет", async ({ page }) => {
  await page.goto("/grades");
  await gradesLoaded(page);
  await expect(summary(page)).toContainText("Стипендия сохраняется");
  await expect(summary(page)).toContainText("Долгов нет");
  await expect(summary(page).getByRole("list", { name: "Долги" })).toHaveCount(0);
});

test("Вера: оценок нет — пустое состояние, без сводки", async ({ browser }) => {
  const page = await as(browser, "Вера");
  await page.goto("/grades");
  await expect(page.getByRole("heading", { name: "Оценок пока нет" })).toBeVisible();
  await expect(summary(page)).toHaveCount(0);
});

test("семестры: переключатель меняет список и адрес; текущий — /grades", async ({ page }) => {
  await page.goto("/grades");
  await gradesLoaded(page);
  const tabs = page.getByRole("navigation", { name: "Семестры" });
  await expect(tabs.getByRole("link", { name: "3-й семестр" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await tabs.getByRole("link", { name: "2-й семестр" }).click();
  await expect(page).toHaveURL(/\/grades\?semester=2$/);
  await expect(page.getByRole("list", { name: "Дисциплины, 2-й семестр" })).toContainText(
    "Отлично (5)",
  );
  await expect(page.getByRole("heading", { level: 2, name: /2-й семестр, закрыт/ })).toHaveCount(1);
  // Сводка «Как у меня дела» — по-прежнему про текущий семестр
  await expect(summary(page)).toContainText("за 3-й семестр");
  await tabs.getByRole("link", { name: "3-й семестр" }).click();
  await expect(page).toHaveURL(/\/grades$/);
});

for (const q of ["semester=мусор", "semester=99", "semester=5", "semester=2&semester=1"]) {
  test(`?${q} — 200 и текущий семестр`, async ({ page }) => {
    const res = await page.goto(`/grades?${q}`);
    expect(res?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { level: 2, name: /3-й семестр, текущий/ }),
    ).toBeVisible();
  });
}

test("детали: из долга — экзаменатор, дата, итог, «это долг»; «Учёба» возвращает", async ({
  browser,
}) => {
  const page = await as(browser, "Тимур");
  await page.goto("/grades");
  await summary(page).getByRole("link", { name: "Долг: Эконометрика" }).click();
  // Ссылка из сводки — сразу к семестру с долгом, а не к зелёному текущему (ux-reviewer, T07)
  await expect(page).toHaveURL(/\/grades\/[a-z0-9-]+#sem-6$/);
  await expect(page.getByRole("heading", { level: 1, name: "Эконометрика" })).toBeVisible();
  const closed = page.getByRole("region", { name: /6-й семестр/ });
  await expect(closed).toContainText("Неудовлетворительно (2)");
  await expect(closed).toBeInViewport();
  await expect(closed).toContainText("Пока долг не закрыт, стипендию не назначат");
  await expect(closed).toContainText("Преподаватель");
  await expect(page.getByRole("region", { name: /7-й семестр, текущий/ })).toBeVisible();
  await page.getByRole("link", { name: "Учёба" }).first().click();
  await expect(page).toHaveURL(/\/grades$/);
});

test.describe("изоляция по id дисциплины", () => {
  test("дисциплина только Алисы: у Тимура — 404 и ни названия, ни баллов", async ({
    page,
    browser,
  }) => {
    // id и название берём со страницы Алисы, после загрузки (урок T05)
    await page.goto("/grades");
    await gradesLoaded(page);
    const alisaIds = await disciplineIds(page);

    const timur = await as(browser, "Тимур");
    await timur.goto("/grades");
    await gradesLoaded(timur);
    const timurIds = new Set(await disciplineIds(timur));
    const alisaOnly = alisaIds.find((id) => !timurIds.has(id));
    expect(alisaOnly, "у Алисы есть дисциплина, которой нет у Тимура").toBeTruthy();

    await page.goto(`/grades/${alisaOnly}`);
    const name = await page.getByRole("heading", { level: 1 }).innerText();

    const res = await timur.goto(`/grades/${alisaOnly}`);
    expect(res?.status()).toBe(404);
    await expect(timur.getByRole("heading", { name: "Такой дисциплины у вас нет" })).toBeVisible();
    expect(await timur.content()).not.toContain(name);
    expect(await timur.title()).not.toContain(name);
  });

  test("общая дисциплина (английский): Тимур видит свои баллы, не Алисины", async ({
    page,
    browser,
  }) => {
    await page.goto("/grades");
    await gradesLoaded(page);
    const alisaIds = await disciplineIds(page);
    const timur = await as(browser, "Тимур");
    await timur.goto("/grades");
    await gradesLoaded(timur);
    const shared = (await disciplineIds(timur)).find((id) => alisaIds.includes(id));
    expect(shared, "есть общая дисциплина").toBeTruthy();

    await page.goto(`/grades/${shared}`);
    const alisaScores = await page.getByText(/^\d+ из 100/).allInnerTexts();
    expect(alisaScores.length).toBeGreaterThan(0);

    const res = await timur.goto(`/grades/${shared}`);
    expect(res?.status()).toBe(200);
    const timurScores = await timur.getByText(/^\d+ из 100/).allInnerTexts();
    expect(timurScores.length).toBeGreaterThan(0);
    for (const s of alisaScores) expect(timurScores).not.toContain(s);
    // И семестров Алисы там нет
    await expect(timur.getByRole("region", { name: /3-й семестр/ })).toHaveCount(0);
  });

  for (const id of ["dsc-nope", "DROP%20TABLE", "..%2F..%2Fetc"]) {
    test(`/grades/${id} — 404`, async ({ page }) => {
      const res = await page.goto(`/grades/${id}`);
      expect(res?.status()).toBe(404);
      await expect(page.getByRole("heading", { name: "Такой дисциплины у вас нет" })).toBeVisible();
    });
  }
});

test.describe("360px и крупный текст", () => {
  for (const route of ["/grades", "/grades/dsc-ecmetr"]) {
    for (const scale of ["100%", "200%"]) {
      test(`Тимур ${route} при тексте ${scale} — без скролла вбок`, async ({ browser }) => {
        const page = await as(browser, "Тимур");
        await page.goto(route);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await setTextScale(page, scale);
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      });
    }
  }
});
