// Заявки и кабинет сотрудника (T08): полный путь Алиса → Ирина → «Готова» → уведомление, двойной
// клик, отклонение с причиной, отмена, изоляция факультетов, 404 по чужому и битому номеру, 360/200%.
// Алиса — сессия по умолчанию (setup), Ирина — STORAGE.irina, Тимур — демо-вход.
// Проекты desktop и mobile-360 идут параллельно под одной Алисой: свои заявки находим по уникальному
// значению поля, а не по счёту строк.
import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { STORAGE } from "../../playwright.config";
import { ANON } from "./helpers/auth";
import { deleteTestRequests, withDb } from "./helpers/db";
import { setTextScale } from "./helpers/text-scale";

async function asTimur(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext({ storageState: ANON })).newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: "Войти как Тимур" }).click();
  await expect(page).toHaveURL(/\/$/);
  return page;
}

async function asIrina(browser: Browser): Promise<Page> {
  return (await browser.newContext({ storageState: STORAGE.irina })).newPage();
}

/** Заявки, созданные тестами этого файла, — удаляются после файла (база общая с демо). */
const created: string[] = [];
test.afterAll(async () => {
  await deleteTestRequests(created);
});

const numberFromUrl = (page: Page) =>
  decodeURIComponent(new URL(page.url()).pathname.split("/").pop()!);
const requestUrl = (n: string) => `/requests/${encodeURIComponent(n)}`;
const staffUrl = (n: string) => `/staff/requests/${encodeURIComponent(n)}`;

/** Подать «Справку об обучении» с уникальным «Куда предоставляется»; вернуть номер. */
async function submitStudy(page: Page, marker = `e2e-${randomUUID().slice(0, 8)}`) {
  await page.goto("/requests/new?type=study_ru");
  await page.getByLabel("Куда предоставляется").fill(marker);
  await page.getByRole("button", { name: "Отправить заявку" }).click();
  await expect(page).toHaveURL(/\/requests\/%D0%A1-\d{4}-\d{5}$/);
  const number = numberFromUrl(page);
  created.push(number);
  return { number, marker };
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test("приёмка: Алиса подала → Ирина приняла → в работу → «Готова» → Алиса видит уведомление", async ({
  page,
  browser,
}) => {
  // Алиса: мастер (T10) «Виза» → первой — «Справка об обучении на английском» → форма → «Подана»
  await page.goto("/requests");
  await page.getByRole("link", { name: "Заказать справку" }).first().click();
  await expect(page).toHaveURL(/\/requests\/new$/);
  await page.getByRole("link", { name: /^Виза/ }).click();
  // Ждём список под цель: иначе «Справка об обучении на английском» нашлась бы в списке заявок Алисы
  const forVisa = page.getByRole("list", { name: "Справки для цели «Виза»" });
  await expect(forVisa.getByRole("link").first()).toHaveText("Справка об обучении на английском");
  await forVisa.getByRole("link", { name: "Справка об обучении на английском" }).click();
  const marker = `e2e-embassy-${randomUUID().slice(0, 6)}`;
  await page.getByLabel(/Addressee/).fill(marker);
  await page.getByRole("button", { name: "Отправить заявку" }).click();
  await expect(page).toHaveURL(/\/requests\/%D0%A1-/);
  const number = numberFromUrl(page);
  created.push(number);
  await expect(page.getByText("Подана", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Ожидаемая готовность/)).toBeVisible();

  // Ирина: заявка в очереди → карточка → три шага
  const irina = await asIrina(browser);
  await irina.goto("/staff");
  const row = irina.getByRole("listitem").filter({ hasText: number });
  await expect(row).toContainText("Петрова А. С., 2МО-3");
  await row.getByRole("link").click();
  await expect(irina.getByRole("heading", { level: 1 })).toHaveText(
    "Справка об обучении на английском",
  );
  await expect(irina.getByText(marker)).toBeVisible();

  await irina.getByLabel(/Комментарий студенту/).fill("Приняли, срок — 3 рабочих дня");
  await irina.getByRole("button", { name: "Принять" }).click();
  await expect(irina.getByRole("status")).toContainText("Статус изменён");
  await irina.getByRole("button", { name: "Взять в работу" }).click();
  await expect(irina.getByRole("button", { name: "Отметить готовой" })).toBeVisible();
  await irina.getByRole("button", { name: "Отметить готовой" }).click();
  await expect(irina.getByRole("button", { name: "Выдать справку" })).toBeVisible();
  await expect(irina.getByText("Готова к выдаче").first()).toBeVisible();
  await expect(irina.getByRole("list", { name: "Ход заявки" })).toContainText(
    "Морозова Ирина Сергеевна",
  );

  // Алиса: уведомление «Справка готова» ведёт в заявку, там «Готова — заберите» и комментарий
  await page.goto("/notifications");
  // T09: строка уведомления — форма «открыть» (отмечает прочитанным), ссылка — в data-link
  const note = page
    .locator(`[data-notification][data-link="${requestUrl(number)}"]`)
    .filter({ hasText: "Справка готова" });
  await expect(note).toHaveCount(1);
  await note.getByRole("button").click();
  await expect(page).toHaveURL(new RegExp(`${requestUrl(number).replace(/[-%]/g, "\\$&")}$`));
  await expect(page.getByText("Готова — заберите").first()).toBeVisible();
  await expect(page.getByText("Приняли, срок — 3 рабочих дня")).toBeVisible();
});

test("двойной клик по «Отправить заявку» — одна заявка", async ({ page }) => {
  const marker = `dbl-${randomUUID().slice(0, 8)}`;
  await page.goto("/requests/new?type=study_ru");
  await page.getByLabel("Куда предоставляется").fill(marker);
  await page.getByRole("button", { name: "Отправить заявку" }).dblclick();
  await expect(page).toHaveURL(/\/requests\/%D0%A1-/);
  created.push(numberFromUrl(page));
  const count = await withDb(async (c) => {
    const r = await c.query(
      `SELECT count(*)::int AS n FROM "Request" WHERE payload->>'addressee' = $1`,
      [marker],
    );
    return r.rows[0].n as number;
  });
  expect(count).toBe(1);
});

test("форма: пустое обязательное поле — ошибка у поля, фокус на нём", async ({ page }) => {
  await page.goto("/requests/new?type=military");
  await page.getByRole("button", { name: "Отправить заявку" }).click();
  const field = page.getByLabel("Военный комиссариат (район)");
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Заполните поле")).toBeVisible();
  await expect(field).toBeFocused();
  await expect(page).toHaveURL(/type=military$/);
});

test("отмена своей поданной заявки — «Отменена», кнопки больше нет", async ({ page }) => {
  const { number } = await submitStudy(page);
  await page.getByRole("button", { name: "Отменить заявку" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Отменить заявку" }).click();
  await expect(page.getByText("Отменена", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Отменить заявку" })).toHaveCount(0);
  await page.goto("/requests");
  await expect(
    page
      .getByRole("list", { name: "Архив заявок" })
      .getByRole("listitem")
      .filter({ hasText: number }),
  ).toContainText("Отменена");
});

test("отклонение — только с причиной; студент видит причину", async ({ page, browser }) => {
  const { number } = await submitStudy(page);
  const irina = await asIrina(browser);
  await irina.goto(staffUrl(number));
  await irina.getByRole("button", { name: "Отклонить" }).click();
  const dialog = irina.getByRole("dialog");
  await dialog.getByRole("button", { name: "Отклонить заявку" }).click();
  await expect(dialog.getByText("Напишите причину")).toBeVisible();
  await dialog.getByLabel("Причина").fill("Укажите организацию полностью");
  await dialog.getByRole("button", { name: "Отклонить заявку" }).click();
  await expect(dialog).toBeHidden();
  await expect(irina.getByText("Отклонена", { exact: true }).first()).toBeVisible();

  await page.goto(requestUrl(number));
  // T13: причина — наверху, в сноске «Деканат отклонил заявку» с «Подать заново», и в истории
  const rejected = page.getByRole("region", { name: "Статус" });
  await expect(rejected.getByText("Деканат отклонил заявку")).toBeVisible();
  await expect(rejected.getByText("Укажите организацию полностью")).toBeVisible();
  await expect(rejected.getByRole("link", { name: "Подать заново" })).toBeVisible();
  await expect(page.getByText("Причина:")).toBeVisible();
});

test.describe("изоляция", () => {
  test("Тимур не видит заявку Алисы ни в списке, ни в уведомлениях (security-reviewer, T08)", async ({
    page,
    browser,
  }) => {
    const { number } = await submitStudy(page);
    const irina = await asIrina(browser);
    await irina.goto(staffUrl(number));
    await irina.getByRole("button", { name: "Принять" }).click();
    await expect(irina.getByRole("status")).toContainText("Статус изменён");
    const link = `[data-notification][data-link="${requestUrl(number)}"]`;

    // Положительный контроль — у Алисы уведомление есть (после загрузки)
    await page.goto("/notifications");
    await expect(page.locator(link)).toHaveCount(1);

    const timur = await asTimur(browser);
    await timur.goto("/notifications");
    await expect(timur.getByRole("heading", { level: 1, name: "Уведомления" })).toBeVisible();
    // Список загрузился (T09: «Новые» и «Прочитанные» — два списка)
    await expect(timur.locator("[data-notification]").first()).toBeVisible();
    await expect(timur.locator(link)).toHaveCount(0);
    await timur.goto("/requests");
    await expect(timur.getByRole("heading", { level: 1, name: "Заявки" })).toBeVisible();
    await expect(timur.getByRole("main")).not.toContainText(number);
  });

  test("смена статуса заявки чужого факультета подменой номера — статус не меняется", async ({
    page,
    browser,
  }) => {
    const foreign = await withDb(async (c) => {
      const r = await c.query(`
        SELECT r.number, r.status FROM "Request" r
        JOIN "Student" s ON s.id = r."studentId"
        JOIN "Group" g ON g.id = s."groupId"
        JOIN "Program" p ON p.id = g."programId"
        WHERE r.status = 'SUBMITTED'
          AND p."facultyId" <> ALL (SELECT unnest("facultyIds") FROM "Staff" WHERE "userId" = 'usr-irina')
        LIMIT 1`);
      return r.rows[0] as { number: string; status: string } | undefined;
    });
    expect(foreign, "в сиде есть поданная заявка чужого факультета").toBeTruthy();

    // Ирина открывает СВОЮ заявку (Алисы, ФМО) и подменяет номер в форме на чужой
    const { number } = await submitStudy(page);
    const irina = await asIrina(browser);
    await irina.goto(staffUrl(number));
    await irina
      .locator('form input[name="number"]')
      .first()
      .evaluate((el, n) => {
        (el as HTMLInputElement).value = n;
      }, foreign!.number);
    await irina.getByRole("button", { name: "Принять" }).click();
    await expect(irina.getByRole("status")).toHaveCount(0);

    const after = await withDb(async (c) => {
      const r = await c.query(`SELECT status FROM "Request" WHERE number = $1`, [foreign!.number]);
      return r.rows[0].status as string;
    });
    expect(after).toBe("SUBMITTED");
    const events = await withDb(async (c) => {
      const r = await c.query(
        `SELECT count(*)::int AS n FROM "RequestEvent" e JOIN "Request" r ON r.id = e."requestId" WHERE r.number = $1 AND e."actorUserId" = 'usr-irina'`,
        [foreign!.number],
      );
      return r.rows[0].n as number;
    });
    expect(events).toBe(0);
  });

  test("Ирина не видит заявки чужих факультетов: ни в очереди, ни по номеру (404)", async ({
    browser,
  }) => {
    const foreign = await withDb(async (c) => {
      const r = await c.query(`
        SELECT r.number FROM "Request" r
        JOIN "Student" s ON s.id = r."studentId"
        JOIN "Group" g ON g.id = s."groupId"
        JOIN "Program" p ON p.id = g."programId"
        WHERE p."facultyId" <> ALL (SELECT unnest("facultyIds") FROM "Staff" WHERE "userId" = 'usr-irina')
        LIMIT 1`);
      return r.rows[0]?.number as string | undefined;
    });
    expect(foreign, "в сиде есть заявка чужого факультета").toBeTruthy();
    const irina = await asIrina(browser);
    await irina.goto("/staff?status=all");
    await expect(irina.getByRole("list", { name: "Заявки в очереди" })).toBeVisible();
    await expect(irina.getByRole("main")).not.toContainText(foreign!);
    const res = await irina.goto(staffUrl(foreign!));
    expect(res?.status()).toBe(404);
    await expect(
      irina.getByRole("heading", { name: "Такой заявки в вашей очереди нет" }),
    ).toBeVisible();
  });

  // Латинская C теперь та же «С» (T14, проверяет security.spec) — здесь только мусор и чужая буква
  for (const bad of ["abc", "X-2026-00001", "С-2026-1"]) {
    test(`/requests/${bad} — 404`, async ({ page }) => {
      const res = await page.goto(`/requests/${encodeURIComponent(bad)}`);
      expect(res?.status()).toBe(404);
      await expect(page.getByRole("heading", { name: "Такой заявки у вас нет" })).toBeVisible();
    });
  }

  test("битая %-последовательность в адресе — 400, а не 500", async ({ page }) => {
    for (const route of ["/requests/%E0%A4", "/grades/%E0%A4", "/staff/requests/%ZZ"]) {
      const res = await page.goto(route);
      expect(res?.status(), route).toBe(400);
    }
  });

  test("студент не попадает в карточку сотрудника", async ({ page }) => {
    const { number } = await submitStudy(page);
    await page.goto(staffUrl(number));
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("button", { name: "Принять" })).toHaveCount(0);
  });
});

test.describe("кабинет сотрудника", () => {
  for (const q of ["status=мусор", "faculty=../x", "type=DROP", "status=all&status=ready"]) {
    test(`/staff?${q} — 200, очередь на месте`, async ({ browser }) => {
      const irina = await asIrina(browser);
      const res = await irina.goto(`/staff?${q}`);
      expect(res?.status()).toBe(200);
      await expect(irina.getByRole("heading", { level: 1, name: "Очередь заявок" })).toBeVisible();
    });
  }

  test("«Сбросить демо» убрали: стенд общий, сброс выкидывал всех экспертов (T14)", async ({
    browser,
  }) => {
    const irina = await asIrina(browser);
    for (const route of ["/staff", "/staff/announcements", "/staff/answers"]) {
      await irina.goto(route);
      await expect(irina.getByRole("button", { name: "Сбросить демо" })).toHaveCount(0);
    }
  });

  test("студенту кнопки «Сбросить демо» нет нигде", async ({ page }) => {
    for (const route of ["/", "/requests"]) {
      await page.goto(route);
      await expect(page.getByRole("button", { name: "Сбросить демо" })).toHaveCount(0);
    }
  });
});

test.describe("360px и текст 200%", () => {
  test("список, форма, заявка — без скролла вбок", async ({ page }) => {
    const { number } = await submitStudy(page);
    for (const route of [
      "/requests",
      "/requests/new",
      "/requests/new?type=embassy",
      requestUrl(number),
    ]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await setTextScale(page, "200%");
      expect(await horizontalOverflow(page), route).toBeLessThanOrEqual(0);
    }
  });

  test("очередь и карточка сотрудника — без скролла вбок", async ({ page, browser }) => {
    const { number } = await submitStudy(page);
    const irina = await asIrina(browser);
    await irina.setViewportSize(page.viewportSize()!);
    for (const route of ["/staff", staffUrl(number)]) {
      await irina.goto(route);
      await expect(irina.getByRole("heading", { level: 1 })).toBeVisible();
      await setTextScale(irina, "200%");
      expect(await horizontalOverflow(irina), route).toBeLessThanOrEqual(0);
    }
  });
});

test.describe("T13: пересдача из долга и подсказки полей", () => {
  test("Тимур: долг → «Подать заявление на пересдачу» → дисциплина уже в форме → заявка", async ({
    browser,
  }) => {
    const timur = await asTimur(browser);
    await timur.goto("/grades");
    await timur.getByRole("link", { name: "Долг: Эконометрика" }).first().click();
    await expect(timur.getByRole("heading", { level: 1, name: "Эконометрика" })).toBeVisible();
    await timur.getByRole("link", { name: "Подать заявление на пересдачу" }).click();

    await expect(
      timur.getByRole("heading", { level: 1, name: "Заявление на пересдачу" }),
    ).toBeVisible();
    // «Назад» — к той же дисциплине; строки «Язык справки: русский» у заявления нет
    await expect(
      timur.getByRole("main").getByRole("link", { name: "Эконометрика" }),
    ).toHaveAttribute("href", "/grades/dsc-ecmetr");
    await expect(timur.getByText(/^Язык справки:/)).toHaveCount(0);
    const discipline = timur.getByLabel("Дисциплина");
    await expect(discipline).toHaveValue("Эконометрика");
    await expect(discipline).toHaveAccessibleDescription(/как в разделе «Учёба»/);
    const marker = `e2e-${randomUUID().slice(0, 8)}`;
    await timur.getByLabel("Комментарий для деканата (необязательно)").fill(marker);
    await timur.getByRole("button", { name: "Отправить заявку" }).click();
    await expect(timur).toHaveURL(/\/requests\/(?!new)[^/?]+$/);
    created.push(numberFromUrl(timur));
    await expect(timur.getByRole("main")).toContainText("Эконометрика");
    await expect(timur.getByRole("main")).toContainText(marker);
  });

  test("чужая или выдуманная дисциплина в адресе не подставляется (S1)", async ({ browser }) => {
    // Дисциплина Алисы, которой у Тимура нет: название не должно появиться у него в форме
    const alien = await withDb(async (c) => {
      const { rows } = await c.query<{ id: string; name: string }>(
        `SELECT DISTINCT d.id, d.name FROM "Grade" g JOIN "Discipline" d ON d.id = g."disciplineId"
          WHERE g."studentId" = 'stu-alisa'
            AND d.id NOT IN (SELECT "disciplineId" FROM "Grade" WHERE "studentId" = 'stu-timur')
          LIMIT 1`,
      );
      return rows[0];
    });
    expect(alien, "у Алисы есть дисциплина, которой нет у Тимура").toBeTruthy();
    const timur = await asTimur(browser);
    for (const id of [alien!.id, "dsc-no-such-discipline"]) {
      const res = await timur.goto(`/requests/new?type=retake&discipline=${id}`);
      expect(res?.status()).toBe(200);
      await expect(timur.getByLabel("Дисциплина")).toHaveValue("");
      expect(await timur.content()).not.toContain(alien!.name);
    }
  });

  test("визовая справка: английский рекомендован и без цели, у полей — подсказки", async ({
    page,
  }) => {
    await page.goto("/requests/new?type=embassy");
    const first = page.getByRole("list", { name: "Язык справки" }).getByRole("listitem").first();
    await expect(first).toContainText("Английский");
    await expect(first).toContainText("Рекомендуем");
    await first.getByRole("link").click();
    await expect(page.getByText("Язык справки: английский")).toBeVisible();
    await expect(page.getByLabel("Страна")).toHaveAccessibleDescription(/например: Франция/);
    await expect(page.getByLabel("Даты поездки")).toHaveAccessibleDescription(/12\.01\.2027/);
  });
});
