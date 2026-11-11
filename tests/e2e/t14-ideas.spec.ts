// T14: три идеи из ресерча — «Вам положено» (J), оценка заявки и «Вы сказали — мы сделали» (K),
// свободные аудитории в окно (N). Мутации — на временном студенте (helpers/temp-student.ts): демо-аккаунты
// и параллельные проекты (desktop, mobile-360) не трогаем. После теста студент удаляется вместе с заявками.
import { randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { STORAGE } from "../../playwright.config";
import { addDays, mskDateKey, mskStartOfWeek } from "../../src/lib/msk";
import { withDb } from "./helpers/db";
import { tempStudent, type TempStudent } from "./helpers/temp-student";
import { setTextScale } from "./helpers/text-scale";

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Временный студент: оценки текущего семестра (средний 88, долгов нет) — проходит правило «Вам положено» */
async function eligibleStudent(browser: Browser, baseURL: string): Promise<TempStudent> {
  const s = await tempStudent(browser, baseURL);
  await withDb(async (c) => {
    for (const [disc, pts] of [
      ["dsc-tmo", 90],
      ["dsc-hist", 86],
    ] as const)
      await c.query(
        `INSERT INTO "Grade" (id, "studentId", "disciplineId", semester, kind, "ratingPoints")
         VALUES ($1, $2, $3, 1, 'EXAM', $4)`,
        [`grd-e2e-${randomBytes(6).toString("hex")}`, s.studentId, disc, pts],
      );
  });
  return s;
}

/** Готовая заявка временного студента — чтобы её оценить */
async function readyRequest(s: TempStudent): Promise<string> {
  const number = `С-2099-${String(Math.floor(Math.random() * 90000) + 10000)}`;
  await withDb((c) =>
    c.query(
      `INSERT INTO "Request" (id, number, "studentId", "typeId", payload, status, "updatedAt")
       VALUES ($1, $2, $3, 'rqt-study_ru', '{"addressee":"e2e"}', 'READY', now())`,
      [`req-e2e-${randomBytes(6).toString("hex")}`, number, s.studentId],
    ),
  );
  return number;
}

/** Уборка: сначала заявки (события ссылаются на пользователя), потом студент целиком */
async function cleanup(s: TempStudent) {
  await withDb((c) => c.query(`DELETE FROM "Request" WHERE "studentId" = $1`, [s.studentId]));
  await s.remove();
}

test.describe("J. «Вам положено»", () => {
  test("подходящему студенту деканат предлагает — заявка в одно касание с пометкой", async ({
    browser,
    baseURL,
  }) => {
    const s = await eligibleStudent(browser, baseURL!);
    try {
      await s.page.goto("/");
      const offers = s.page.getByRole("region", { name: "Деканат предлагает" });
      await expect(offers).toContainText("Вы подходите на повышенную академическую стипендию");
      await expect(offers).toContainText("88 из 100");
      await expect(offers).toContainText("Правило вымышленное");
      expect(await overflow(s.page)).toBeLessThanOrEqual(0);
      await offers.getByRole("button", { name: "Подать заявление" }).click();
      await expect(s.page).toHaveURL(/\/requests\/%D0%A1-\d{4}-\d{5}$/);
      await expect(
        s.page.getByRole("heading", { level: 1, name: "Заявление на повышенную стипендию" }),
      ).toBeVisible();
      await expect(s.page.getByText("Заявку предложил деканат")).toBeVisible();
      const offered = await withDb((c) =>
        c.query(`SELECT offered FROM "Request" WHERE "studentId" = $1`, [s.studentId]),
      );
      expect(offered.rows).toEqual([{ offered: true }]);
      // Подано — больше не предлагаем
      await s.page.goto("/");
      await expect(s.page.getByRole("region", { name: "Деканат предлагает" })).toHaveCount(0);
    } finally {
      await cleanup(s);
    }
  });

  test("«Не сейчас» прячет предложение", async ({ browser, baseURL }) => {
    const s = await eligibleStudent(browser, baseURL!);
    try {
      await s.page.goto("/");
      const offers = s.page.getByRole("region", { name: "Деканат предлагает" });
      await offers.getByRole("button", { name: "Не сейчас" }).click();
      await expect(offers).toHaveCount(0);
      await s.page.reload();
      await expect(s.page.getByRole("region", { name: "Деканат предлагает" })).toHaveCount(0);
    } finally {
      await cleanup(s);
    }
  });

  test("Тимуру (долг, стипендия под угрозой) не предлагаем", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.getByRole("button", { name: "Войти как Тимур" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: /, Тимур$/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Деканат предлагает" })).toHaveCount(0);
    await ctx.close();
  });
});

test.describe("K. Оценка заявки и «Вы сказали — мы сделали»", () => {
  test("студент оценивает готовую заявку один раз — дальше «Спасибо»", async ({
    browser,
    baseURL,
  }) => {
    const s = await tempStudent(browser, baseURL!);
    try {
      const number = await readyRequest(s);
      await s.page.goto(`/requests/${encodeURIComponent(number)}`);
      const rate = s.page.getByRole("region", { name: "Как вам работа деканата?" });
      // Без оценки — ошибка у группы, не отправка
      await rate.getByRole("button", { name: "Отправить оценку" }).click();
      await expect(rate.getByText("Выберите оценку от 1 до 5")).toBeVisible();
      await rate.locator("label").filter({ hasText: /^4/ }).click();
      await rate
        .getByLabel("Что можно улучшить? (необязательно)")
        .fill("Хорошо бы SMS о готовности");
      await rate.getByRole("button", { name: "Отправить оценку" }).click();
      await expect(rate).toContainText("Спасибо! Ваша оценка: 4 из 5");
      await expect(rate.getByRole("button", { name: "Отправить оценку" })).toHaveCount(0);
      const row = await withDb((c) =>
        c.query(`SELECT rating, "ratingComment" FROM "Request" WHERE number = $1`, [number]),
      );
      expect(row.rows).toEqual([{ rating: 4, ratingComment: "Хорошо бы SMS о готовности" }]);
      expect(
        await new AxeBuilder({ page: s.page })
          .analyze()
          .then((r) =>
            r.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
          ),
      ).toEqual([]);
    } finally {
      await cleanup(s);
    }
  });

  test.describe("сотрудник", () => {
    test.use({ storageState: STORAGE.irina });
    test("в очереди — «Что говорят студенты» без имён и путь к ответу объявлением", async ({
      page,
    }) => {
      await page.goto("/staff");
      const block = page.getByRole("region", { name: "Что говорят студенты" });
      await expect(block).toContainText("Средняя оценка");
      await expect(block).toContainText("забрать некогда");
      await expect(block).not.toContainText(/Королёва|Савельев|Ершова/);
      await block.getByRole("link", { name: /Вы сказали — мы сделали/ }).click();
      await expect(page).toHaveURL(/\/staff\/announcements\?youSaid=1$/);
      await expect(
        page.getByLabel(/Ответ на отзывы студентов — пометка «Вы сказали — мы сделали»/),
      ).toBeChecked();
    });
  });

  test("на доске объявлений — пометка «Вы сказали — мы сделали»", async ({ page }) => {
    await page.goto("/notifications?tab=announcements");
    await expect(page.getByText("Вы сказали — мы сделали").first()).toBeVisible();
    await expect(page.getByText("Вы просили — выдаём справки по четвергам до 19:00")).toBeVisible();
  });
});

test.describe("N. Свободные аудитории в окно", () => {
  test("в среду у Алисы окно перед французским — ближайшие к следующей паре аудитории; 200 % без скролла", async ({
    page,
  }) => {
    // Среда следующей недели: прошедшие окна скрыты, а эта всегда впереди
    const wednesday = mskDateKey(addDays(mskStartOfWeek(new Date()), 9));
    await page.goto(`/schedule?day=${wednesday}`);
    const row = page
      .getByRole("list", { name: /^Пары: / })
      .getByRole("listitem")
      .filter({ hasText: /Окно \d/ });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(/По расписанию свободно \d+|Почти все аудитории свободны/);
    await expect(row).toContainText(/рядом (со следующей|с прошлой) парой \(ауд\.\s\d+\): \d+/);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await setTextScale(page, "200%");
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});
