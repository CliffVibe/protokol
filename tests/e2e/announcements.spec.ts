// Объявления (T09, приёмка 1): Ирина публикует объявление для МЭО — Тимур (МЭО) видит его
// в уведомлениях и на доске, Алиса (ФМО) видит объявление сида для ФМО (положительный контроль) и не видит МЭО.
// Разметка безопасна: <script> и javascript: из текста не исполняются и не попадают в href (S5).
// База общая с демо: объявления и уведомления, созданные тестом, тест и удаляет.
import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { STORAGE } from "../../playwright.config";
import { ANON } from "./helpers/auth";
import { withDb } from "./helpers/db";

const titles: string[] = [];
test.afterAll(async () => {
  if (!titles.length) return;
  await withDb(async (c) => {
    await c.query(`DELETE FROM "Notification" WHERE kind = 'ANNOUNCEMENT' AND title = ANY($1)`, [
      titles,
    ]);
    await c.query(`DELETE FROM "Announcement" WHERE title = ANY($1)`, [titles]);
  });
});

async function asTimur(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext({ storageState: ANON })).newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: "Войти как Тимур" }).click();
  await expect(page).toHaveURL(/\/$/);
  return page;
}

/** Опубликовать от Ирины: «Кому» — только указанный факультет. */
async function publish(irina: Page, title: string, body: string, faculty: "ФМО" | "МЭО") {
  titles.push(title);
  await irina.goto("/staff/announcements");
  await irina.getByLabel("Заголовок").fill(title);
  await irina.getByLabel("Текст").fill(body);
  const audience = irina.getByRole("group", { name: "Кому" });
  for (const code of ["ФМО", "МЭО"]) {
    const box = audience.getByRole("checkbox", { name: new RegExp(`^${code} —`) });
    if (code === faculty) await box.check();
    else await box.uncheck();
  }
  await irina.getByRole("button", { name: "Опубликовать" }).click();
  await expect(irina.getByRole("status")).toContainText(/Опубликовано: получили \d+ студент/);
}

test("приёмка: объявление для МЭО видит Тимур, не видит Алиса; своё ФМО Алиса видит", async ({
  page,
  browser,
}) => {
  const tag = randomUUID().slice(0, 6);
  const meo = `МЭО: неделя карьеры ${tag}`;
  // Положительный контроль у Алисы — объявление сида только для ФМО. Своё для ФМО не публикуем: оно стало бы
  // последним объявлением на «Сейчас» у Алисы и вытеснило бы то, на которое опирается now.spec (параллельно)
  const fmo = "Конференция «Протокол и дипломатия»";
  const irina = await (await browser.newContext({ storageState: STORAGE.irina })).newPage();
  await publish(
    irina,
    meo,
    '**Важно:** регистрация до пятницы.\n\n- резюме\n- мотивационное письмо\n\n[Подробнее](javascript:alert(1)) и [заявки](/requests)\n\n<script>window.__xss = 1</script><img src=x onerror="window.__xss = 2">',
    "МЭО",
  );
  // В «Мои объявления» — с адресатом
  await expect(irina.getByRole("listitem").filter({ hasText: meo })).toContainText("Кому: МЭО.");

  // Тимур: уведомление во «Все» и объявление на доске
  const timur = await asTimur(browser);
  await timur.goto("/notifications");
  await expect(timur.getByRole("button", { name: new RegExp(meo) })).toBeVisible();
  await expect(timur.getByText(fmo)).toHaveCount(0);
  await timur.goto("/notifications?tab=announcements");
  const item = timur
    .getByRole("listitem")
    .filter({ has: timur.getByRole("heading", { name: meo }) });
  await expect(item).toBeVisible();
  await expect(item.locator("strong")).toHaveText("Важно:");
  await expect(item.getByRole("listitem")).toHaveText(["резюме", "мотивационное письмо"]);
  // javascript: — только текст без ссылки; путь внутри сайта — ссылка
  await expect(item.getByText("Подробнее")).toBeVisible();
  await expect(item.getByRole("link", { name: "Подробнее" })).toHaveCount(0);
  await expect(item.getByRole("link", { name: "заявки" })).toHaveAttribute("href", "/requests");
  // Теги из текста — текстом, не разметкой
  await expect(item).toContainText("<script>window.__xss = 1</script>");
  expect(await item.locator("script, img").count()).toBe(0);
  expect(await timur.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined();

  // Уведомление ведёт на доску к объявлению
  await timur.goto("/notifications");
  await timur.getByRole("button", { name: new RegExp(meo) }).click();
  await expect(timur).toHaveURL(/\/notifications\?tab=announcements#announcement-/);

  // Алиса: ФМО видит (положительный контроль), МЭО — нет ни в уведомлениях, ни на доске
  await page.goto("/notifications?tab=announcements");
  await expect(page.getByRole("heading", { name: fmo })).toBeVisible();
  await expect(page.getByText(meo)).toHaveCount(0);
  await page.goto("/notifications");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Уведомления");
  await expect(page.getByText(meo)).toHaveCount(0);
});

test("форма объявления: ошибки у полей, введённое не теряется", async ({ browser }) => {
  const irina = await (await browser.newContext({ storageState: STORAGE.irina })).newPage();
  await irina.goto("/staff/announcements");
  await irina.getByLabel("Текст").fill("Текст без заголовка");
  await irina.getByRole("button", { name: "Опубликовать" }).click();
  await expect(irina.getByLabel("Заголовок")).toHaveAttribute("aria-invalid", "true");
  await expect(irina.getByLabel("Заголовок")).toBeFocused();
  await expect(irina.getByLabel("Текст")).toHaveValue("Текст без заголовка");
});
