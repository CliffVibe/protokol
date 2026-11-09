// Расписание (T06): «День / Неделя», изменения без цвета, переход между корпусами, лист с деталями,
// битые ?week и ?day, 360px и текст 200%, изоляция Тимур ↔ Алиса.
// Алиса — сессия по умолчанию (setup); Тимур — демо-вход в отдельном контексте.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { addDays, formatIsoWeek, mskDateKey, mskStartOfWeek } from "../../src/lib/msk";
import { ANON } from "./helpers/auth";
import { setTextScale } from "./helpers/text-scale";

const THIS_WEEK = formatIsoWeek(new Date());
const WEEK_URL = `/schedule?week=${THIS_WEEK}`;
const TODAY = mskDateKey(new Date());
// Четверг этой недели: у Алисы пара в Одинцове и переход туда и обратно
const THURSDAY = mskDateKey(addDays(mskStartOfWeek(new Date()), 3));
const dayUrl = (key: string) => (key === TODAY ? "/schedule" : `/schedule?day=${key}`);
const THURSDAY_URL = dayUrl(THURSDAY);

async function asTimur(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ storageState: ANON });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: "Войти как Тимур" }).click();
  await expect(page).toHaveURL(/\/$/);
  return page;
}

const lessonItems = (page: Page) =>
  page.getByRole("list", { name: /^Пары: / }).getByRole("listitem");

/** Неделя загружена (а не skeleton): иначе проверка «не содержит» прошла бы на пустой странице. */
async function weekLoaded(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: "Расписание" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Недели", exact: true })).toBeVisible();
  await expect(lessonItems(page).first()).toBeVisible();
}

const dayNav = (page: Page) => page.getByRole("navigation", { name: "Соседние дни" });

/** Одна строка перехода в Одинцово и пара сразу после неё. */
async function transitionToOdintsovo(page: Page) {
  const row = lessonItems(page).filter({ hasText: /Переход между корпусами с .* в Одинцово/ });
  await expect(row).toHaveCount(1);
  const next = await row.evaluate((li) => li.nextElementSibling?.textContent ?? "");
  return { row, next };
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe("неделя Алисы", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(WEEK_URL);
    await weekLoaded(page);
  });

  test("перенос различим без цвета: иконка + «Перенос» + «было ЧЧ:ММ»", async ({ page }) => {
    const moved = lessonItems(page).filter({ hasText: "Перенос" }).first();
    await expect(moved).toBeVisible();
    await expect(moved).toContainText(/Было \d{2}:\d{2}/);
    await expect(moved.locator("[data-tone=warn] svg")).toBeVisible();
  });

  test("отмена различима без цвета: зачёркнуто + «Отмена» + иконка", async ({ page }) => {
    const cancelled = lessonItems(page).filter({ hasText: "Отмена" }).first();
    await expect(cancelled.locator("[data-tone=danger] svg")).toBeVisible();
    const decoration = await cancelled
      .getByRole("button")
      .evaluate((el) => getComputedStyle(el).textDecorationLine);
    expect(decoration).toContain("line-through");
    // Перенос и отмена — разные иконки, а не один значок разного цвета
    const icon = async (tone: string) =>
      page.locator(`main [data-tone=${tone}] svg`).first().getAttribute("class");
    expect(await icon("warn")).not.toBe(await icon("danger"));
  });

  test("четверг: переход — своя строка между парами: когда перерыв и откуда куда", async ({
    page,
  }) => {
    const { row, next } = await transitionToOdintsovo(page);
    await expect(row).toContainText(/Перерыв \d+\sмин — переход в другой корпус/);
    await expect(row).toContainText(/с \d{2}:\d{2} до \d{2}:\d{2}/);
    await expect(row).toContainText(/Главный корпус .*→ Одинцово/);
    // Сразу за строкой перехода — пара, на которую идём
    expect(next).toMatch(/ауд\.\s\S+, Одинцово/);
    // У строки перехода нет листа: это не пара
    await expect(row.getByRole("button")).toHaveCount(0);
  });

  test("языковая пара — в общей ленте, с бейджем группы", async ({ page }) => {
    await expect(
      lessonItems(page)
        .filter({ hasText: /Англ\. B2-4|Франц\. A2-1/ })
        .first(),
    ).toBeVisible();
  });

  test("«Изменения недели» ведут к дню пары", async ({ page }) => {
    const summary = page.getByRole("region", { name: "Изменения недели" });
    const first = summary.getByRole("link").first();
    const href = await first.getAttribute("href");
    expect(href).toMatch(/^#day-\d{4}-\d{2}-\d{2}$/);
    await expect(page.locator(href!)).toHaveCount(1);
  });

  test("лист с деталями: аудитория, корпус, преподаватель; Esc закрывает, фокус возвращается", async ({
    page,
  }) => {
    const row = lessonItems(page).filter({ hasText: "Перенос" }).first();
    const open = row.getByRole("button");
    await open.click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText("Где")).toBeVisible();
    await expect(sheet.getByText("Кто ведёт")).toBeVisible();
    await expect(sheet).toContainText(/ауд\.\s\S+, /);
    await expect(sheet).toContainText(/Стало \d{2}:\d{2}, было/);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(open).toBeFocused();
  });

  test("лист закрывается кнопкой «Закрыть»", async ({ page }) => {
    await lessonItems(page).first().getByRole("button").click();
    await page.getByRole("dialog").getByRole("button", { name: "Закрыть" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});

test.describe("переключатель и недели", () => {
  test("«День» по умолчанию, «Неделя» — ?week=, стрелки и «К текущей неделе»", async ({ page }) => {
    await page.goto("/schedule");
    const toggle = page.getByRole("navigation", { name: "Вид расписания" });
    await expect(toggle.getByRole("link", { name: "День" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      page.getByRole("region", { name: "Завтра" }).or(page.getByText("Сегодня пар нет")),
    ).toBeVisible();

    await toggle.getByRole("link", { name: "Неделя" }).click();
    // «Неделя» сразу ведёт к сегодняшнему дню — в пятницу не листать пять экранов
    await expect(page).toHaveURL(new RegExp(`\\?week=${THIS_WEEK}#day-\\d{4}-\\d{2}-\\d{2}$`));
    const weeks = page.getByRole("navigation", { name: "Недели", exact: true });
    await expect(weeks).toContainText("Эта неделя");
    const range = await weeks.locator("p").first().innerText();

    await weeks.getByRole("link", { name: /^Следующая неделя/ }).click();
    await expect(page).not.toHaveURL(new RegExp(`week=${THIS_WEEK}`));
    await expect(page).toHaveURL(/\?week=\d{4}-W\d{2}$/);
    await expect(weeks).toContainText("Следующая неделя");
    await expect(weeks.locator("p").first()).not.toHaveText(range);

    await weeks.getByRole("link", { name: "К текущей неделе" }).click();
    await expect(page).toHaveURL(new RegExp(`\\?week=${THIS_WEEK}$`));
    await expect(weeks.locator("p").first()).toHaveText(range);
  });

  for (const query of [
    "week=мусор",
    "week=2026-W99",
    "week=2026-W00",
    "week=9999-W01",
    `week=${THIS_WEEK}&week=${THIS_WEEK}`, // массив — тоже битое значение
  ]) {
    test(`?${query} — 200 и текущая неделя, не ошибка`, async ({ page }) => {
      const res = await page.goto(`/schedule?${query}`);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("navigation", { name: "Недели", exact: true })).toContainText(
        "Эта неделя",
      );
      await expect(
        page.getByRole("heading", { name: "Не получилось загрузить расписание" }),
      ).toHaveCount(0);
    });
  }

  test("«День»: стрелки по дням, «К сегодня», полоса недели открывает день", async ({ page }) => {
    await page.goto("/schedule");
    const nav = dayNav(page);
    await expect(nav).toContainText("Сегодня");
    await expect(nav.getByRole("link", { name: "К сегодня" })).toHaveCount(0);

    await nav.getByRole("link", { name: /^Следующий день/ }).click();
    const tomorrow = mskDateKey(addDays(new Date(), 1));
    await expect(page).toHaveURL(new RegExp(`\\?day=${tomorrow}$`));
    await expect(nav).toContainText("Завтра");

    await nav.getByRole("link", { name: "К сегодня" }).click();
    await expect(page).toHaveURL(/\/schedule$/);
    await expect(nav).toContainText("Сегодня");

    // Полоса дней: выбранный день — aria-current="date"; «page» на странице один — у «День»
    const strip = page.getByRole("navigation", { name: "Дни недели" });
    await expect(strip.locator("[aria-current=date]")).toHaveCount(1);
    await expect(page.locator("main [aria-current=page]")).toHaveCount(1);
    await strip.getByRole("link").first().click();
    const monday = mskDateKey(mskStartOfWeek(new Date()));
    await expect(page).toHaveURL(new RegExp(monday === TODAY ? "/schedule$" : `\\?day=${monday}$`));
    await expect(page.getByRole("list", { name: /^Пары: Понедельник/ })).toBeVisible();
  });

  test("из «Недели» полоса дней открывает день отдельно", async ({ page }) => {
    await page.goto(WEEK_URL);
    await weekLoaded(page);
    await page
      .getByRole("navigation", { name: "Дни недели" })
      .getByRole("link", { name: /^чт/ })
      .click();
    await expect(page).toHaveURL(
      new RegExp(THURSDAY === TODAY ? "/schedule$" : `day=${THURSDAY}$`),
    );
    await expect(page.getByRole("list", { name: /^Пары: / })).toHaveCount(1);
    await transitionToOdintsovo(page);
  });

  for (const query of [
    "day=мусор",
    "day=2026-02-30",
    "day=9999-01-01",
    `day=${TODAY}&day=${TODAY}`,
  ]) {
    test(`?${query} — 200 и сегодня, не ошибка`, async ({ page }) => {
      const res = await page.goto(`/schedule?${query}`);
      expect(res?.status()).toBe(200);
      await expect(dayNav(page)).toContainText("Сегодня");
    });
  }

  test("далёкая неделя без пар — пустое состояние с выходом к текущей", async ({ page }) => {
    // +1 год от текущего ещё разрешён, но в сиде пар там нет
    const year = Number(THIS_WEEK.slice(0, 4)) + 1;
    await page.goto(`/schedule?week=${year}-W20`);
    await expect(page.getByRole("heading", { name: "На этой неделе пар нет" })).toBeVisible();
    await page.getByRole("main").getByRole("link", { name: "К текущей неделе" }).first().click();
    await expect(page).toHaveURL(new RegExp(`\\?week=${THIS_WEEK}$`));
  });
});

test.describe("360px и крупный текст", () => {
  for (const route of ["/schedule", WEEK_URL, THURSDAY_URL]) {
    for (const scale of ["100%", "200%"]) {
      test(`${route} при тексте ${scale} — без скролла вбок`, async ({ page }) => {
        await page.goto(route);
        await expect(lessonItems(page).first()).toBeVisible();
        await setTextScale(page, scale);
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      });
    }
  }

  test("открытый лист при тексте 200% — без скролла вбок", async ({ page }) => {
    await page.goto(WEEK_URL);
    await weekLoaded(page);
    await setTextScale(page, "200%");
    await lessonItems(page).filter({ hasText: "Перенос" }).first().getByRole("button").click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    const overflow = await sheet.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });

  test("стрелки недель — цели ≥ 44×44 и при тексте 200% не растут", async ({ page }) => {
    await page.goto(WEEK_URL);
    await setTextScale(page, "200%");
    for (const name of [/^Предыдущая неделя/, /^Следующая неделя/]) {
      const box = await page.getByRole("link", { name }).boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeLessThan(60);
    }
  });
});

test("изоляция: Тимур не видит пар группы Алисы", async ({ page, browser }) => {
  // Пары Алисы берём из её же недели (не из сида), после загрузки (урок T05)
  await page.goto(WEEK_URL);
  await weekLoaded(page);
  const alisaRows = await lessonItems(page).allInnerTexts();
  expect(alisaRows.length).toBeGreaterThan(5);
  const alisaText = await page.getByRole("main").innerText();
  expect(alisaText).toContain("Одинцово");
  expect(alisaText).toContain("Преподаватель на конференции");

  const timur = await asTimur(browser);
  await timur.goto(WEEK_URL);
  await weekLoaded(timur);
  const timurRows = await lessonItems(timur).allInnerTexts();
  expect(timurRows.length).toBeGreaterThan(0);
  for (const row of alisaRows) expect(timurRows).not.toContain(row);
  const timurText = await timur.getByRole("main").innerText();
  expect(timurText).not.toContain("Одинцово");
  expect(timurText).not.toContain("Преподаватель на конференции");
  expect(timurText).not.toContain("Занятие отработаем на консультации");
  // Языковые группы Алисы — тоже не его
  expect(timurText).not.toMatch(/Англ\. B2-4|Франц\. A2-1/);
});

test("изоляция на ?day=: у Тимура в четверг нет Одинцова и перехода Алисы", async ({
  page,
  browser,
}) => {
  await page.goto(THURSDAY_URL);
  await expect(lessonItems(page).first()).toBeVisible();
  await transitionToOdintsovo(page);

  const timur = await asTimur(browser);
  await timur.goto(THURSDAY_URL);
  await expect(dayNav(timur)).toBeVisible();
  await expect(lessonItems(timur).first().or(timur.getByText("В этот день пар нет"))).toBeVisible();
  const text = await timur.getByRole("main").innerText();
  expect(text).not.toContain("Одинцово");
  expect(text).not.toContain("переход в другой корпус");
});
