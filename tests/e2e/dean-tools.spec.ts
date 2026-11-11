// T14+: инструменты деканата — утренний брифинг, пакетная обработка с шаблонами, база знаний из заявок.
// Алиса — сессия по умолчанию (setup), Ирина — STORAGE.irina. Проекты desktop и mobile-360 идут
// параллельно: каждый тест отмечает и меняет только свои заявки (по номеру), «Выбрать все» только
// проверяет и снимает выбор — пачкой чужое не трогаем. Уборка: свои заявки, уведомления и ответы.
import { randomInt, randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { STORAGE } from "../../playwright.config";
import { deleteTestRequests, withDb } from "./helpers/db";

const created: string[] = [];
const words: string[] = [];
test.afterAll(async () => {
  await withDb(async (c) => {
    for (const w of words)
      await c.query(`DELETE FROM "FaqEntry" WHERE title LIKE $1 OR keywords LIKE $1`, [`%${w}%`]);
  });
  await deleteTestRequests(created);
});

const asIrina = async (browser: Browser) =>
  (await browser.newContext({ storageState: STORAGE.irina })).newPage();

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const seriousAxe = async (page: Page) =>
  (await new AxeBuilder({ page }).analyze()).violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );

/** Алиса подаёт «Справку об обучении» с уникальным «Куда предоставляется» → номер. */
async function submitStudy(page: Page) {
  await page.goto("/requests/new?type=study_ru");
  await page.getByLabel("Куда предоставляется").fill(`e2e-${randomUUID().slice(0, 8)}`);
  await page.getByRole("button", { name: "Отправить заявку" }).click();
  await expect(page).toHaveURL(/\/requests\/%D0%A1-\d{4}-\d{5}$/);
  const number = decodeURIComponent(new URL(page.url()).pathname.split("/").pop()!);
  created.push(number);
  return number;
}

/** Случайное «слово» кириллицей — ключ ответа этого теста (поиск помощника идёт по основам слов). */
const randomWord = () =>
  Array.from(
    { length: 8 },
    (_, i) => (i % 2 ? "аеиоуы" : "бвгдзклмнпрстфх")[randomInt(i % 2 ? 6 : 15)],
  ).join("");

test("брифинг: «Главное на сегодня» с приветствием; «горят» ведёт в очередь просроченных и со сроком сегодня", async ({
  browser,
}) => {
  const irina = await asIrina(browser);
  await irina.goto("/staff");
  const brief = irina.getByRole("region", { name: "Главное на сегодня" });
  await expect(brief).toContainText(
    /(Доброе утро|Добрый день|Добрый вечер|Доброй ночи), Ирина Сергеевна/,
  );
  // В сиде есть просроченная заявка (подана 4 дня назад, срок — 2 рабочих): строка срочности — словами
  await brief.getByRole("link", { name: /просрочен|срок сегодня/ }).click();
  await expect(irina).toHaveURL(/\/staff\?due=urgent$/);
  await expect(irina.getByText("Только горящие: просрочены или срок — сегодня.")).toBeVisible();
  // На отфильтрованной очереди брифинга нет — он лишь отодвигал бы заявки
  await expect(irina.getByRole("region", { name: "Главное на сегодня" })).toHaveCount(0);
  const rows = irina.getByRole("list", { name: "Заявки в очереди" }).getByRole("listitem");
  await expect(rows.first()).toBeVisible();
  for (const row of await rows.all())
    await expect(row).toContainText(/Просрочена на|Срок — сегодня/);
  await irina.getByRole("link", { name: "Показать все" }).click();
  await expect(irina).toHaveURL(/\/staff$/);
});

test("пачка: две заявки Алисы → «Принять» с шаблоном → итог в фокусе, у Алисы уведомления", async ({
  page,
  browser,
}) => {
  const a = await submitStudy(page);
  const b = await submitStudy(page);
  const irina = await asIrina(browser);
  await irina.goto("/staff");
  for (const n of [a, b]) await irina.getByRole("checkbox", { name: new RegExp(n) }).check();

  await expect(irina.getByText(/^Выбрано: 2$/)).toBeAttached();
  await irina.getByRole("button", { name: "Принять 2 заявки…" }).click();

  const dialog = irina.getByRole("dialog", { name: "Принять 2 заявки?" });
  await expect(dialog.getByLabel("Ответ студентам")).toHaveValue("accept-due");
  await expect(dialog).toContainText("Приняли заявку на справку ‹название справки›.");
  await dialog.getByRole("button", { name: "Принять 2 заявки", exact: true }).click();
  const done = irina.getByText("Приняли 2 заявки — студенты получили уведомления.");
  await expect(done).toBeFocused();
  // Выбор снят, липкой строки больше нет
  await expect(irina.getByText(/^Выбрано: /)).toHaveCount(0);

  const statuses = await withDb((c) =>
    c.query<{ status: string }>(`SELECT status FROM "Request" WHERE number = ANY($1)`, [[a, b]]),
  );
  expect(statuses.rows.map((r) => r.status)).toEqual(["ACCEPTED", "ACCEPTED"]);
  await page.goto("/notifications?tab=requests");
  await expect(
    page.getByText(/Приняли заявку на справку «Справка об обучении/).first(),
  ).toBeVisible();
});

test("пачка: «Выбрать «Готова к выдаче»», подтверждение — без скролла вбок; axe без серьёзных", async ({
  browser,
}) => {
  const irina = await asIrina(browser);
  await irina.goto("/staff?status=ready");
  await irina.getByRole("button", { name: /^Выбрать «Готова к выдаче» \(\d+\)$/ }).click();
  await expect(irina.getByText(/^Выбрано: \d+$/)).toBeAttached();
  expect(await overflow(irina)).toBeLessThanOrEqual(0);
  await irina.getByRole("button", { name: /^Выдать \d+ справ\p{L}*…$/u }).click();
  const dialog = irina.getByRole("dialog");
  await expect(dialog).toContainText("Отклонить пачкой нельзя");
  expect(await overflow(irina)).toBeLessThanOrEqual(0);
  // Не применяем: «Готовы к выдаче» — общие заявки сида
  await dialog.getByRole("button", { name: "Не сейчас" }).click();
  expect(await seriousAxe(irina)).toEqual([]);
  await irina.getByRole("button", { name: "Снять «Готова к выдаче»" }).click();
  await expect(irina.getByText(/^Выбрано: /)).toHaveCount(0);
});

test("база знаний: ответ Ирины → черновик без имени → опубликован → помощник отвечает Алисе", async ({
  page,
  browser,
}) => {
  const word = randomWord();
  words.push(word);
  // Своя выданная заявка с ответом Ирины, где есть имя студента (параллельный проект — своя заявка)
  const number = `С-${new Date().getFullYear()}-${randomInt(100_000_000, 999_999_999)}`;
  created.push(number);
  await withDb(async (c) => {
    const id = `e2e-req-${randomUUID()}`;
    await c.query(
      `INSERT INTO "Request" (id, number, "studentId", "typeId", language, payload, status, "createdAt", "updatedAt")
       SELECT $1, $2, 'stu-savelev', t.id, 'en', '{"country":"Франция","tripDates":"02.01 — 09.01"}', 'ISSUED', now(), now()
       FROM "RequestType" t WHERE t.code = 'embassy'`,
      [id, number],
    );
    await c.query(
      `INSERT INTO "RequestEvent" (id, "requestId", status, comment, "actorUserId", "createdAt")
       VALUES ($1, $2, 'READY', $3, 'usr-irina', now())`,
      [
        `${id}-ev`,
        id,
        `Игорь, справка готова. Для визы консульству достаточно справки на английском, перевод не нужен. ${word}`,
      ],
    );
  });

  const irina = await asIrina(browser);
  await irina.goto(`/staff/requests/${encodeURIComponent(number)}`);
  await irina.getByRole("button", { name: "Сделать ответом помощника" }).click();
  await expect(irina).toHaveURL(/\/staff\/answers\/[a-z0-9]+\?removed=name$/);
  await expect(irina.getByText(/Убрали из ответа: имя студента/)).toBeVisible();
  const body = irina.getByLabel("Ответ", { exact: true });
  await expect(body).not.toHaveValue(/Игор/);
  await expect(body).toHaveValue(/^Справка готова\./);
  expect(await seriousAxe(irina)).toEqual([]);

  await irina.getByLabel("Вопрос").fill(`Нужен ли перевод справки для визы (${word})?`);
  await irina.getByLabel("Ключевые слова").fill(`${word}, перевод справки, виза`);
  // Вернуть имя правкой — публикация не пройдёт
  await body.fill(`Игорь, перевод не нужен. ${word}`);
  await irina.getByRole("button", { name: "Опубликовать" }).click();
  // Ошибка — у поля «Ответ», фокус на нём
  await expect(irina.getByText(/тут остались личные данные: имя студента/)).toBeVisible();
  await expect(irina.getByLabel("Ответ", { exact: true })).toBeFocused();
  await irina
    .getByLabel("Ответ", { exact: true })
    .fill(`Перевод не нужен: консульству достаточно справки на английском. ${word}`);
  await irina.getByRole("button", { name: "Опубликовать" }).click();
  await expect(irina.getByText(/^Опубликовано: помощник уже отвечает/)).toBeFocused();

  await page.goto("/assistant");
  await page
    .getByRole("textbox", { name: "Ваш вопрос" })
    .fill(`${word} нужен ли перевод справки для визы`);
  await page.getByRole("button", { name: "Спросить" }).click();
  const log = page.getByRole("log", { name: "Разговор с помощником" });
  await expect(log).toHaveAttribute("aria-busy", "false");
  const answer = log.locator(":scope > ol > li").last();
  await expect(answer).toContainText(`Нужен ли перевод справки для визы (${word})?`);
  await expect(answer).toContainText(/Ответ деканата от \d+ \p{L}+/u);

  // Список ответов: опубликованный — в «Опубликованы»; axe без серьёзных
  await irina.goto("/staff/answers");
  await expect(
    irina
      .getByRole("region", { name: "Опубликованы" })
      .getByRole("link", { name: new RegExp(word) }),
  ).toBeVisible();
  expect(await seriousAxe(irina)).toEqual([]);
});

test("чужой и битый id ответа — 404", async ({ browser }) => {
  const irina = await asIrina(browser);
  for (const id of ["no-such-entry", "..%2F..", "x".repeat(41)]) {
    const r = await irina.goto(`/staff/answers/${id}`);
    expect(r?.status()).toBe(404);
  }
});
