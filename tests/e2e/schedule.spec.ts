// Расписание (T06): «Сегодня / Неделя», изменения без цвета, переход между корпусами, лист с деталями,
// битый ?week, 360px и текст 200%, изоляция Тимур ↔ Алиса.
// Алиса — сессия по умолчанию (setup); Тимур — демо-вход в отдельном контексте.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { formatIsoWeek } from "../../src/lib/msk";
import { ANON } from "./helpers/auth";

const THIS_WEEK = formatIsoWeek(new Date());
const WEEK_URL = `/schedule?week=${THIS_WEEK}`;

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

  test("четверг: «Переход между корпусами» перед парой в Одинцове", async ({ page }) => {
    const thursday = page.getByRole("region", { name: /^Четверг/ });
    const odintsovo = thursday.getByRole("listitem").filter({ hasText: /ауд\. \S+, Одинцово/ });
    await expect(odintsovo).toContainText(/Переход между корпусами: перерыв \d+ мин/);
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
    await expect(sheet).toContainText(/ауд\. \S+, /);
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
  test("«Сегодня» по умолчанию, «Неделя» — ?week=, стрелки и «К текущей неделе»", async ({
    page,
  }) => {
    await page.goto("/schedule");
    const toggle = page.getByRole("navigation", { name: "Вид расписания" });
    await expect(toggle.getByRole("link", { name: "Сегодня" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      page.getByRole("region", { name: "Завтра" }).or(page.getByText("Сегодня пар нет")),
    ).toBeVisible();

    await toggle.getByRole("link", { name: "Неделя" }).click();
    await expect(page).toHaveURL(new RegExp(`\\?week=${THIS_WEEK}$`));
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
  for (const route of ["/schedule", WEEK_URL]) {
    for (const scale of ["100%", "200%"]) {
      test(`${route} при тексте ${scale} — без скролла вбок`, async ({ page }) => {
        await page.goto(route);
        await expect(lessonItems(page).first()).toBeVisible();
        await page.evaluate((s) => {
          document.documentElement.style.fontSize = s;
        }, scale);
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      });
    }
  }

  test("открытый лист при тексте 200% — без скролла вбок", async ({ page }) => {
    await page.goto(WEEK_URL);
    await weekLoaded(page);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await lessonItems(page).filter({ hasText: "Перенос" }).first().getByRole("button").click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    const overflow = await sheet.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });

  test("стрелки недель — цели ≥ 44×44 и при тексте 200% не растут", async ({ page }) => {
    await page.goto(WEEK_URL);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
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
