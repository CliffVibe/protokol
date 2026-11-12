// T14: идеи из ресерча — «Вам положено» (J), оценка заявки и «Вы сказали — мы сделали» (K). Свободные
// аудитории в окно (N) у студента сняты 11.11 (аудитории закрыты, ключей студентам не дают) — подбор
// аудитории остался сотруднику при переносе пары, его проверяет reschedule.spec. Мутации — на временном студенте (helpers/temp-student.ts): демо-аккаунты
// и параллельные проекты (desktop, mobile-360) не трогаем. После теста студент удаляется вместе с заявками.
import { randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { STORAGE } from "../../playwright.config";
import { withDb } from "./helpers/db";
import { tempStudent, type TempStudent } from "./helpers/temp-student";

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/**
 * Временный студент: две закрытые сессии только на «отлично», текущий 3-й семестр без долгов — проходит
 * правило «Вам положено» (повышенная стипендия за учёбу, T14)
 */
async function eligibleStudent(browser: Browser, baseURL: string): Promise<TempStudent> {
  const s = await tempStudent(browser, baseURL);
  await withDb(async (c) => {
    for (const [disc, semester, mark, pts] of [
      ["dsc-tmo", 1, 5, 92],
      ["dsc-hist", 2, 5, 90],
      ["dsc-tmo", 3, null, 90],
      ["dsc-hist", 3, null, 86],
    ] as const)
      await c.query(
        `INSERT INTO "Grade" (id, "studentId", "disciplineId", semester, kind, "finalMark", "ratingPoints")
         VALUES ($1, $2, $3, $4, 'EXAM', $5, $6)`,
        [`grd-e2e-${randomBytes(6).toString("hex")}`, s.studentId, disc, semester, mark, pts],
      );
    // Временный студент — в группе Веры (1-й курс): справку первокурснику он «уже отложил», чтобы на
    // карточке было одно предложение — стипендия (правило первокурсника проверяет тест Веры ниже)
    await c.query(
      `INSERT INTO "OfferDismissal" (id, "studentId", code, semester) VALUES ($1, $2, 'first_year_study', 3)`,
      [`ofd-e2e-${randomBytes(6).toString("hex")}`, s.studentId],
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
      await expect(offers).toContainText("Вы подходите на повышенную стипендию за успехи в учёбе");
      await expect(offers).toContainText("2 сессии подряд только на «отлично»");
      await expect(offers).not.toContainText("Правило упрощено для демо");
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

  // Демо-аккаунты только смотрим, не нажимаем: «Подать» поменяло бы их для параллельных проектов
  test("Тимуру (долг) — заявление на пересдачу, а не стипендия; дедлайна стипендии в «Скоро» нет", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.getByRole("button", { name: "Войти как Тимур" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: /, Тимур$/ })).toBeVisible();
    // Карточку пересдачи у Тимура проверяет тест временного студента ниже: requests.spec подаёт Тимуру
    // настоящее заявление на пересдачу, и при параллельном прогоне карточка честно пропадает
    await expect(page.getByRole("region", { name: "Деканат предлагает" })).not.toContainText(
      "стипендию",
    );
    await expect(page.getByRole("region", { name: "Скоро" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Скоро" })).not.toContainText(
      "повышенную стипендию",
    );
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await ctx.close();
  });

  test("студент с долгом и назначенной пересдачей — заявление заполнено дисциплиной", async ({
    browser,
    baseURL,
  }) => {
    const s = await tempStudent(browser, baseURL!);
    try {
      await withDb(async (c) => {
        // 1-й семестр — долг с будущей датой (пересдача), 2-й — текущий
        await c.query(
          `INSERT INTO "Grade" (id, "studentId", "disciplineId", semester, kind, "finalMark", "ratingPoints", "examDate")
           VALUES ($1, $2, 'dsc-ecmetr', 1, 'EXAM', 2, 40, now() + interval '4 days'),
                  ($3, $2, 'dsc-tmo', 2, 'EXAM', NULL, 75, NULL)`,
          [
            `grd-e2e-${randomBytes(6).toString("hex")}`,
            s.studentId,
            `grd-e2e-${randomBytes(6).toString("hex")}`,
          ],
        );
        await c.query(
          `INSERT INTO "OfferDismissal" (id, "studentId", code, semester) VALUES ($1, $2, 'first_year_study', 2)`,
          [`ofd-e2e-${randomBytes(6).toString("hex")}`, s.studentId],
        );
      });
      await s.page.goto("/");
      const offers = s.page.getByRole("region", { name: "Деканат предлагает" });
      await expect(offers).toContainText("Заявление на пересдачу: Эконометрика");
      await expect(offers).toContainText("Пересдача назначена на");
      await expect(offers).not.toContainText("стипендию");
      expect(await overflow(s.page)).toBeLessThanOrEqual(0);
      await offers.getByRole("button", { name: "Подать заявление" }).click();
      await expect(s.page).toHaveURL(/\/requests\/%D0%A1-\d{4}-\d{5}$/);
      await expect(
        s.page.getByRole("heading", { level: 1, name: "Заявление на пересдачу" }),
      ).toBeVisible();
      await expect(s.page.getByRole("main")).toContainText("Эконометрика");
      await expect(s.page.getByText("Заявку предложил деканат")).toBeVisible();
    } finally {
      await cleanup(s);
    }
  });

  test("Вере (1-й курс, без оценок) — справка об обучении «по месту требования»", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.getByRole("button", { name: "Войти как Вера" }).click();
    await expect(page).toHaveURL(/\/$/);
    const offers = page.getByRole("region", { name: "Деканат предлагает" });
    await expect(offers).toContainText("Вам может пригодиться справка об обучении");
    await expect(offers.getByRole("button", { name: "Заказать справку" })).toBeVisible();
    await ctx.close();
  });

  test("первокурсник принимает справку — заявка «по месту требования» с пометкой", async ({
    browser,
    baseURL,
  }) => {
    const s = await tempStudent(browser, baseURL!);
    try {
      await s.page.goto("/");
      const offers = s.page.getByRole("region", { name: "Деканат предлагает" });
      await offers.getByRole("button", { name: "Заказать справку" }).click();
      await expect(s.page).toHaveURL(/\/requests\/%D0%A1-\d{4}-\d{5}$/);
      await expect(
        s.page.getByRole("heading", { level: 1, name: "Справка об обучении" }),
      ).toBeVisible();
      await expect(s.page.getByText("По месту требования")).toBeVisible();
      await expect(s.page.getByText("Заявку предложил деканат")).toBeVisible();
    } finally {
      await cleanup(s);
    }
  });
});

test("демо: сменить роль без выхода — Алиса → Тимур → Ирина → Алиса", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: "Войти как Алиса" }).click();
  await expect(page).toHaveURL(/\/$/);

  const switcher = page.getByRole("region", { name: "Демо: другой аккаунт" });
  await page.goto("/profile");
  // Себя в списке нет — только остальные три; у кнопки глагол, под ней — кто это
  await expect(switcher.getByRole("button")).toHaveText([
    "Войти как Тимур",
    "Войти как Вера",
    "Войти как Ирина",
  ]);
  await expect(
    switcher.getByRole("button", { name: "Войти как Тимур" }),
  ).toHaveAccessibleDescription(/4 курс/);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await switcher.getByRole("button", { name: "Войти как Тимур" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /, Тимур$/ })).toBeVisible();

  await page.goto("/more");
  await switcher.getByRole("button", { name: "Войти как Ирина" }).click();
  await expect(page).toHaveURL(/\/staff$/);
  await expect(switcher.getByRole("button")).toHaveText([
    "Войти как Алиса",
    "Войти как Тимур",
    "Войти как Вера",
  ]);
  await switcher.getByRole("button", { name: "Войти как Алиса" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /, Алиса$/ })).toBeVisible();
  await ctx.close();
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
