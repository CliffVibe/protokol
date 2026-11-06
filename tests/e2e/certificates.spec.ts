// Справки (T10): мастер «Зачем нужна справка?», PDF только владельцу, публичная /verify и отзыв.
// Алиса — сессия по умолчанию, Ирина — STORAGE.irina, Тимур — демо-вход, проверяющий — без входа.
// База общая с демо человека: справку для отзыва тест создаёт сам и сам удаляет (helpers/db.ts).
// Готовая справка Алисы из сида — только читаем.
import { randomBytes, randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { STORAGE } from "../../playwright.config";
import { pdfContains } from "../unit/pdf-text";
import { ANON } from "./helpers/auth";
import { deleteTestRequests, withDb } from "./helpers/db";
import { tempStudent } from "./helpers/temp-student";

const created: string[] = [];
test.afterAll(async () => {
  await deleteTestRequests(created);
});

const requestUrl = (n: string) => `/requests/${encodeURIComponent(n)}`;
const staffUrl = (n: string) => `/staff/requests/${encodeURIComponent(n)}`;

async function anonPage(browser: Browser): Promise<Page> {
  return (await browser.newContext({ storageState: ANON })).newPage();
}

async function asTimur(browser: Browser): Promise<Page> {
  const page = await anonPage(browser);
  await page.goto("/login");
  await page.getByRole("button", { name: "Войти как Тимур" }).click();
  await expect(page).toHaveURL(/\/$/);
  return page;
}

/** Готовая неотозванная справка Алисы из сида (самая ранняя — не та, что создают тесты). */
async function alisaSeedDoc(): Promise<{ number: string; token: string }> {
  const row = await withDb(
    async (c) =>
      (
        await c.query<{ number: string; token: string }>(
          `SELECT r.number, d."verifyToken" AS token
           FROM "IssuedDocument" d JOIN "Request" r ON r.id = d."requestId"
          WHERE r."studentId" = 'stu-alisa' AND r.status = 'READY' AND NOT d.revoked
          ORDER BY d."issuedAt" ASC LIMIT 1`,
        )
      ).rows[0],
  );
  expect(row, "в сиде у Алисы есть готовая справка").toBeDefined();
  return row!;
}

/**
 * Временная выданная справка (статус «Выдана» — в «Активные» Алисы не попадает и не путает
 * соседние spec, которые берут первую активную заявку). По умолчанию — у Алисы (факультет Ирины).
 */
async function createIssuedDoc(
  studentId = "stu-alisa",
): Promise<{ number: string; token: string }> {
  const number = `С-2099-${String(randomBytes(4).readUInt32BE() % 1e9).padStart(9, "0")}`;
  const token = randomBytes(16).toString("base64url");
  await withDb(async (c) => {
    const id = `e2e-${randomUUID()}`;
    await c.query(
      `INSERT INTO "Request" (id, number, "studentId", "typeId", language, payload, status, "updatedAt")
       VALUES ($1, $2, $3, 'rqt-study_ru', 'ru', '{"addressee":"e2e-отзыв"}', 'ISSUED', now())`,
      [id, number, studentId],
    );
    await c.query(
      `INSERT INTO "IssuedDocument" (id, "requestId", "verifyToken", "issuedAt", "validUntil")
       VALUES ($1, $2, $3, now(), now() + interval '90 days')`,
      [`e2e-${randomUUID()}`, id, token],
    );
  });
  created.push(number);
  return { number, token };
}

test.describe("мастер «Зачем нужна справка?»", () => {
  test("приёмка: «Виза» — первой английская; «Посольство» → язык → форма на английском", async ({
    page,
  }) => {
    await page.goto("/requests/new");
    await expect(
      page.getByRole("list", { name: "Для чего нужна справка" }).getByRole("link"),
    ).toHaveCount(6);
    await page.getByRole("link", { name: /^Виза/ }).click();

    const list = page.getByRole("list", { name: "Справки для цели «Виза»" });
    await expect(list.getByRole("link")).toHaveText([
      "Справка об обучении на английском",
      "Справка для посольства (визовая)",
    ]);
    await expect(list).toContainText("Чаще всего просят для визы");
    await list.getByRole("link", { name: "Справка для посольства (визовая)" }).click();

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("На каком языке справка?");
    const langs = page.getByRole("list", { name: "Язык справки" });
    await expect(langs.getByRole("link")).toHaveText(["Английский", "Русский"]);
    await expect(langs).toContainText("Рекомендуем");
    await langs.getByRole("link", { name: "Английский" }).click();

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Справка для посольства (визовая)",
    );
    await expect(page.getByText(/^Язык справки:/)).toContainText("английский");
    await expect(page.locator('input[name="language"]')).toHaveValue("en");
    await page.getByRole("link", { name: "Изменить язык справки" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("На каком языке справка?");
  });

  test("«Я знаю, какая справка нужна» — полный каталог; битые параметры — первый шаг", async ({
    page,
  }) => {
    await page.goto("/requests/new");
    await page.getByRole("link", { name: "Я знаю, какая справка нужна" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Все справки");
    await expect(
      page.getByRole("list", { name: "Справки и заявления" }).getByRole("link"),
    ).toHaveCount(8);

    for (const bad of ["?purpose=hack", "?purpose=visa&purpose=work", "?type=%00", "?lang=xx"]) {
      const res = await page.goto(`/requests/new${bad}`);
      expect(res?.status(), bad).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Заказать справку");
    }
  });
});

test.describe("PDF справки", () => {
  test("Алиса скачивает свою; Тимур по тому же адресу — 404; без входа — на /login", async ({
    page,
    browser,
  }) => {
    const doc = await alisaSeedDoc();
    await page.goto(requestUrl(doc.number));
    const link = page.getByRole("link", { name: "Скачать справку (PDF)" });
    const href = await link.getAttribute("href");
    expect(href).toBe(`${requestUrl(doc.number)}/pdf`);

    const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
    expect(download.suggestedFilename()).toMatch(/^spravka-S-\d{4}-\d{5}\.pdf$/);

    const own = await page.request.get(href!);
    expect(own.status()).toBe(200);
    expect(own.headers()["content-type"]).toBe("application/pdf");
    expect(own.headers()["cache-control"]).toContain("no-store");
    const pdf = await own.body();
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    // QR и строка проверки ведут на /verify с токенам этой справки; шрифты нашлись в standalone-сборке
    expect(pdfContains(pdf, `/verify/${doc.token}`)).toBe(true);
    expect(pdf.toString("latin1")).toMatch(/\/BaseFont \/[A-Z]+\+PTSans-/);

    const timur = await asTimur(browser);
    const foreign = await timur.request.get(href!);
    expect(foreign.status()).toBe(404);
    expect((await foreign.body()).subarray(0, 5).toString()).not.toBe("%PDF-");

    const anon = await anonPage(browser);
    const noSession = await anon.request.get(href!, { maxRedirects: 0 });
    expect([302, 303, 307, 308]).toContain(noSession.status());
    expect(noSession.headers()["location"]).toMatch(/\/login$/);
  });

  test("неготовая заявка и мусор в номере — 404", async ({ page }) => {
    const notReady = await withDb(
      async (c) =>
        (
          await c.query<{ number: string }>(
            `SELECT number FROM "Request" WHERE "studentId" = 'stu-alisa'
               AND status IN ('SUBMITTED','ACCEPTED','IN_PROGRESS') ORDER BY seq LIMIT 1`,
          )
        ).rows[0]!.number,
    );
    // Положительный контроль: сама заявка Алисе открывается
    expect((await page.goto(requestUrl(notReady)))?.status()).toBe(200);
    await expect(page.getByRole("link", { name: "Скачать справку (PDF)" })).toHaveCount(0);
    expect((await page.request.get(`${requestUrl(notReady)}/pdf`)).status()).toBe(404);
    expect((await page.request.get("/requests/garbage/pdf")).status()).toBe(404);
  });
});

test.describe("проверка по QR (/verify)", () => {
  test.use({ storageState: ANON });

  test("действительная: статус, тип, дата, инициалы; axe в обеих темах", async ({ page }) => {
    const doc = await alisaSeedDoc();
    const res = await page.goto(`/verify/${doc.token}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Справка действительна");
    await expect(page.getByText("This certificate is valid")).toBeVisible();
    await expect(page.getByText("Справка об обучении на английском")).toBeVisible();
    // Срок действия — решение человека 07.11 (S7)
    await expect(page.getByText(/^Действует до/)).toBeVisible();
    // Справка на английском — инициалы латиницей, как в самой справке
    await expect(
      page.locator("dd").filter({ hasText: /^[A-Z][a-z]+ [A-Z]\. [A-Z]\.$/ }),
    ).toHaveCount(1);
    await expect(page.getByRole("note")).toContainText("Концепт для конкурса");
    const meta = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(meta).toContain("noindex");

    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.reload();
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(
        violations
          .filter((v) => v.impact === "serious" || v.impact === "critical")
          .map((v) => v.id),
      ).toEqual([]);
    }
  });

  test("нет такой — 404 «Справка не найдена»; битый токен — тоже 404", async ({ page }) => {
    for (const token of ["A".repeat(22), "garbage", "A".repeat(23)]) {
      const res = await page.goto(`/verify/${token}`);
      expect(res?.status(), token).toBe(404);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Справка не найдена");
    }
  });
});

test("отзыв: Ирина отзывает → /verify «Отозвана» без причины, PDF — 404, Алиса видит причину", async ({
  page,
  browser,
}) => {
  const doc = await createIssuedDoc();
  const reason = `Ошибка в данных e2e-${randomUUID().slice(0, 6)}`;
  const checker = await anonPage(browser);
  await checker.goto(`/verify/${doc.token}`);
  await expect(checker.getByRole("heading", { level: 1 })).toHaveText("Справка действительна");
  expect((await page.request.get(`${requestUrl(doc.number)}/pdf`)).status()).toBe(200);

  const irina = await (await browser.newContext({ storageState: STORAGE.irina })).newPage();
  await irina.goto(staffUrl(doc.number));
  await expect(irina.getByRole("heading", { name: "Справка", exact: true })).toBeVisible();
  await irina.getByRole("button", { name: "Отозвать справку" }).click();
  const dialog = irina.getByRole("dialog");
  await dialog.getByRole("button", { name: "Отозвать справку" }).click();
  await expect(dialog.getByText("Напишите причину")).toBeVisible();
  await dialog.getByLabel("Причина").fill(reason);
  await dialog.getByRole("button", { name: "Отозвать справку" }).click();
  await expect(dialog).toBeHidden();
  await expect(irina.getByText(/^Отозвана/)).toBeVisible();
  await expect(irina.getByRole("button", { name: "Отозвать справку" })).toHaveCount(0);

  await checker.reload();
  await expect(checker.getByRole("heading", { level: 1 })).toHaveText("Справка отозвана деканатом");
  expect(await checker.content()).not.toContain(reason);

  expect((await page.request.get(`${requestUrl(doc.number)}/pdf`)).status()).toBe(404);
  await page.goto(requestUrl(doc.number));
  await expect(page.getByText("Деканат отозвал справку")).toBeVisible();
  await expect(page.getByText(reason)).toBeVisible();
  await expect(page.getByRole("link", { name: "Скачать справку (PDF)" })).toHaveCount(0);
});

test("отзыв справки чужого факультета подменой номера в форме — справка не тронута", async ({
  browser,
  baseURL,
}) => {
  // Чужая справка — у временного студента в группе Веры (МЖ, не факультет Ирины)
  const stranger = await tempStudent(browser, baseURL!);
  try {
    const foreign = await createIssuedDoc(stranger.studentId);
    // Положительный контроль: владелец свою справку видит, Ирине карточка — 404
    expect((await stranger.page.goto(requestUrl(foreign.number)))?.status()).toBe(200);
    const irina = await (await browser.newContext({ storageState: STORAGE.irina })).newPage();
    expect((await irina.goto(staffUrl(foreign.number)))?.status()).toBe(404);

    // Ирина открывает СВОЮ справку и подменяет номер в форме отзыва на чужой
    const own = await createIssuedDoc();
    await irina.goto(staffUrl(own.number));
    await irina.getByRole("button", { name: "Отозвать справку" }).click();
    const dialog = irina.getByRole("dialog");
    await dialog.locator('input[name="number"]').evaluate((el, n) => {
      (el as HTMLInputElement).value = n;
    }, foreign.number);
    await dialog.getByLabel("Причина").fill("Попытка чужого факультета");
    await dialog.getByRole("button", { name: "Отозвать справку" }).click();

    const revoked = (token: string) =>
      withDb(
        async (c) =>
          (
            await c.query<{ revoked: boolean }>(
              `SELECT revoked FROM "IssuedDocument" WHERE "verifyToken" = $1`,
              [token],
            )
          ).rows[0]!.revoked,
      );
    // Ответ сервера — «не найдено» (как несуществующая); ждём, пока запрос дойдёт
    await expect(irina.getByRole("heading", { level: 1 })).not.toHaveText("Справка об обучении", {
      timeout: 10_000,
    });
    expect(await revoked(foreign.token)).toBe(false);
    // И своя справка не отозвалась «заодно»
    expect(await revoked(own.token)).toBe(false);
  } finally {
    await deleteTestRequests(created.splice(0));
    await stranger.remove();
  }
});
