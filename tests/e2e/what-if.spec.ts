// «Что если…» (T11): выбрать итог сессии → сразу видно, сохранится ли стипендия. Ничего не сохраняется,
// данные не меняются. Алиса — сессия по умолчанию (прошлая сессия чистая, шесть дисциплин без итога);
// Тимур — демо-вход (долг прошлого семестра: прогноз «под угрозой» при любых оценках).
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator } from "@playwright/test";
import { ANON } from "./helpers/auth";

/** Выбрать вариант: щёлкаем по подписи-кнопке (сама радиокнопка визуально скрыта). */
const option = (scope: Locator, name: RegExp | string) =>
  scope.locator("label").filter({ has: scope.page().getByRole("radio", { name }) });

test("Алиса: экзамен на 3 — стипендия под угрозой; сброс — сохранится", async ({ page }) => {
  await page.goto("/grades");
  const section = page.getByRole("region", { name: "Что если…" });
  await expect(section).toBeVisible();
  const result = section.getByRole("status");
  await expect(result).toContainText("После сессии стипендия сохранится");
  await expect(result).toContainText("Пока ничего не выбрано");

  // Первая дисциплина с оценкой (не зачёт): у неё есть вариант «3»
  const exam = section.getByRole("group").filter({ has: page.getByRole("radio", { name: /^3/ }) });
  const name = (await exam.first().locator("legend").textContent())!.trim();
  await option(exam.first(), /^3/).click();

  await expect(result).toContainText("После сессии стипендию не назначат");
  await expect(result).toContainText(`Оценка 3: ${name}`);
  // Пока есть невыбранные — средний «по выбранным», чтобы не спорить с допущением «остальные на 4+»
  await expect(result).toContainText("Средний балл по выбранным: 3");
  await expect(result).toContainText(/Без выбора 5\s+дисциплин/);

  // Пересчёт на клиенте: страница не перезагружалась, в «Как у меня дела» — прежний ответ
  await expect(page.getByRole("region", { name: "Как у меня дела" })).toContainText(
    "Стипендия сохраняется",
  );

  await section.getByRole("button", { name: "Сбросить" }).click();
  await expect(result).toContainText("После сессии стипендия сохранится");
  await expect(section.getByRole("button", { name: "Сбросить" })).toHaveCount(0);

  const { violations } = await new AxeBuilder({ page }).include("#what-if").analyze();
  expect(
    violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id),
  ).toEqual([]);
});

test("ссылка из «Как у меня дела» ведёт к симулятору, у закрытого семестра его нет", async ({
  page,
}) => {
  await page.goto("/grades?semester=2");
  await expect(page.getByRole("region", { name: "Что если…" })).toHaveCount(0);
  await page.getByRole("link", { name: "Что если сдать сессию…" }).click();
  await expect(page).toHaveURL(/\/grades#what-if$/);
  await expect(page.getByRole("region", { name: "Что если…" })).toBeVisible();
});

test("Тимур: старый долг не исчезает от пятёрок", async ({ browser }) => {
  const page = await (await browser.newContext({ storageState: ANON })).newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: "Войти как Тимур" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/grades");
  const section = page.getByRole("region", { name: "Что если…" });
  // all() не ждёт: под нагрузкой потоковая часть страницы приходила позже, и цикл не щёлкал ничего
  await expect(section.getByRole("group")).toHaveCount(4);
  for (const group of await section.getByRole("group").all()) {
    const five = group.getByRole("radio", { name: /^5/ });
    await option(group, (await five.count()) ? /^5/ : /^Зачтено$/).click();
  }
  const result = section.getByRole("status");
  await expect(result).toContainText("После сессии стипендию не назначат");
  await expect(result).toContainText("Долг:");
  await expect(result).toContainText("Средний балл сессии: 5");
});

test("телефон: значок итога прилипает над навигацией, пока листаешь дисциплины", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-360", "липкая полоса — только на телефоне");
  await page.goto("/grades");
  const section = page.getByRole("region", { name: "Что если…" });
  const groups = section.getByRole("group");
  await expect(groups.first()).toBeVisible();
  await groups.first().scrollIntoViewIfNeeded();
  // Первая дисциплина на экране, конец списка — далеко внизу, а значок итога уже виден
  const chip = section.locator("[aria-hidden=true]").filter({ hasText: "После сессии стипендия" });
  await expect(chip).toBeInViewport();
  await expect(groups.last()).not.toBeInViewport();
});
