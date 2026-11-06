import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const NOTICE =
  "Концепт для конкурса. Не является официальным сервисом МГИМО. Все данные вымышлены.";

test("главная открывается и показывает плашку концепта", async ({ page }) => {
  await page.goto("/");
  // T05: заголовок «Сейчас» — приветствие по времени суток
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /^(Доброе утро|Добрый день|Добрый вечер|Доброй ночи), /,
    }),
  ).toBeVisible();
  await expect(page.getByRole("note")).toHaveText(NOTICE);
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
});

test("нет горизонтального скролла", async ({ page }) => {
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("axe: нет серьёзных нарушений доступности", async ({ page }) => {
  await page.goto("/");
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test("/api/health отвечает и не кэшируется", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true, db: true });
  expect(res.headers()["cache-control"]).toContain("no-store");
});
