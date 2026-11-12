// Ключевые сценарии жюри (docs/01-concept.md → «Ключевые сценарии»), T13 часть Б: путь целиком,
// так, как его пройдёт человек с телефона — вход кнопкой демо-режима на /login, дальше касаниями.
// Отдельные шаги глубже проверяют профильные spec, здесь их не дублируем:
//   1 «Утро» — now.spec.ts; 2 «Как дела с учёбой» — grades.spec.ts, what-if.spec.ts;
//   3–4 на Алисе — requests.spec.ts («приёмка»), certificates.spec.ts (мастер, PDF);
//   5 — certificates.spec.ts («проверка по QR»), security.spec.ts (тест 8);
//   6 «Изоляция» — security.spec.ts (тест 1), requests.spec.ts («изоляция»).
// Здесь — то, чего там нет: сквозная цепочка 3 → 4 → 5 на Тимуре (его персона едет на стажировку
// и берёт справку для визы), до QR из скачанного PDF и публичной страницы проверки.
// БД: только уборка созданной заявки (helpers/db.ts → deleteTestRequests).
import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { STORAGE } from "../../../playwright.config";
import { pdfTextVariants } from "../../unit/pdf-text";
import { ANON } from "../helpers/auth";
import { deleteTestRequests } from "../helpers/db";

test.use({ screenshot: "only-on-failure" });

const created: string[] = [];
test.afterAll(async () => {
  await deleteTestRequests(created);
});

type Demo = "Алиса" | "Тимур" | "Вера" | "Ирина";

/** Вход как у жюри: /login → «Войти как …» (DEMO_MODE=1). */
async function demoLogin(browser: Browser, who: Demo): Promise<Page> {
  const page = await (await browser.newContext({ storageState: ANON })).newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: `Войти как ${who}` }).click();
  await expect(page).toHaveURL(who === "Ирина" ? /\/staff$/ : /\/$/);
  return page;
}

/**
 * Скролл вбок: scrollWidth шире layout viewport (clientWidth). Не innerWidth: при isMobile Chromium
 * отдаляет страницу под широкий контент, и innerWidth растёт вместе со scrollWidth (616 = 616 при 360 —
 * проверено на T13), так что «scrollWidth > innerWidth» на телефоне не срабатывает никогда.
 */
async function noHorizontalScroll(page: Page, where: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${where}: scrollWidth > clientWidth`).toBeLessThanOrEqual(0);
}

const bottomNav = (page: Page) => page.getByRole("navigation", { name: "Основная навигация" });
const numberFromUrl = (page: Page) =>
  decodeURIComponent(new URL(page.url()).pathname.split("/").pop()!);
const requestUrl = (n: string) => `/requests/${encodeURIComponent(n)}`;
const escape = (s: string) => s.replace(/[-%]/g, "\\$&");

test("сценарий 1 «Утро»: вход → «Сейчас»: пара с аудиторией, преподавателем и отсчётом, перенос, дедлайн", async ({
  browser,
}) => {
  const page = await demoLogin(browser, "Алиса");
  await expect(page.getByRole("heading", { level: 1, name: /, Алиса$/ })).toBeVisible();

  // Ближайшая пара — за 0 касаний: плашка начинается на первом экране 360×740
  const card = page.getByRole("article", { name: /пара|Идёт сейчас/ });
  await expect(card).toBeVisible();
  const box = await card.boundingBox();
  expect(box!.y, "плашка пары видна без прокрутки").toBeLessThan(page.viewportSize()!.height);
  await expect(card).toContainText(/ауд\.\s\S+, /);
  await expect(card).toContainText("Кто ведёт:");
  await expect(card).toContainText(/через \d+\s(мин|ч)|идёт, до конца \d+/);

  // Перенос подсвечен не только цветом: слово «Перенос» и «было ЧЧ:ММ». Если перенесённая пара — ближайшая,
  // он в её плашке, а «Изменения» его не повторяют (T14); иначе — в «Изменениях»
  const changes = card.or(page.getByRole("region", { name: "Изменения" }));
  await expect(changes.getByText(/Перенос/).first()).toBeVisible();
  await expect(changes.filter({ hasText: /Перенос/ }).first()).toContainText(/было \d{2}:\d{2}/i);

  // Ближайший дедлайн (сид: через 2 дня)
  const soon = page.getByRole("list", { name: "Ближайшие дедлайны и экзамены" });
  await expect(soon).toContainText(/Дедлайн, /);

  await noHorizontalScroll(page, "/");
});

test("сценарий 2 «Как дела с учёбой»: Тимур → «Учёба» → средний, светофор, сессия, стипендия под угрозой", async ({
  browser,
}) => {
  const page = await demoLogin(browser, "Тимур");
  await bottomNav(page).getByRole("link", { name: "Учёба" }).click();
  await expect(page).toHaveURL(/\/grades$/);

  const summary = page.getByRole("region", { name: "Как у меня дела" });
  await expect(summary).toContainText(/Средний рейтинг за \d+-й семестр: \d+(,\d+)?\sиз 100/);
  await expect(summary).toContainText("Стипендия не назначена");
  await expect(summary).toContainText(/Экзамены и зачёты/);

  // Светофор: у проблемной дисциплины — чип с тоном (не зелёный), у спокойной — тихая подпись со значком
  // (T13: мятный чип «В норме» в каждой строке был громче проблемы)
  const rows = page.getByRole("list", { name: /^Дисциплины, / }).getByRole("listitem");
  await expect(rows.first()).toBeVisible();
  await expect(rows.first().locator("[data-tone=warn], [data-tone=danger]").first()).toBeVisible();
  const withStatus = rows.filter({ has: page.locator("[data-tone], [data-quiet-status]") });
  expect(await withStatus.count()).toBe(await rows.count());

  await noHorizontalScroll(page, "/grades (Тимур)");
});

test("сценарии 3 → 4 → 5: справка для визы — мастер, деканат, уведомление, PDF с QR, публичная проверка", async ({
  browser,
}) => {
  // ── 3. Справка для визы: Заявки → «Зачем нужна справка?» → «Виза» → английская первой → отправить
  const timur = await demoLogin(browser, "Тимур");
  await bottomNav(timur).getByRole("link", { name: "Заявки" }).click();
  await expect(timur).toHaveURL(/\/requests$/);
  await timur.getByRole("link", { name: "Заказать справку" }).first().click();
  await expect(timur).toHaveURL(/\/requests\/new$/);
  await expect(timur.getByRole("list", { name: "Для чего нужна справка" })).toBeVisible();
  await timur.getByRole("link", { name: /^Виза/ }).click();

  const forVisa = timur.getByRole("list", { name: "Справки для цели «Виза»" });
  await expect(forVisa.getByRole("link").first()).toHaveText("Справка об обучении на английском");
  await noHorizontalScroll(timur, "мастер: справки для визы");
  await forVisa.getByRole("link", { name: "Справка об обучении на английском" }).click();

  const marker = `e2e-visa-${randomUUID().slice(0, 6)}`;
  await timur.getByLabel(/Addressee/).fill(marker);
  await noHorizontalScroll(timur, "форма справки на английском");
  await timur.getByRole("button", { name: "Отправить заявку" }).click();
  await expect(timur).toHaveURL(/\/requests\/%D0%A1-\d{4}-\d{5}$/);
  const number = numberFromUrl(timur);
  created.push(number);
  await expect(timur.getByText("Подана", { exact: true }).first()).toBeVisible();
  await expect(timur.getByText(/Ожидаемая готовность/)).toBeVisible();

  // ── 4. Деканат: Ирина в очереди находит заявку Тимура → «Принять» → у Тимура «Принята»
  const irina = await (await browser.newContext({ storageState: STORAGE.irina })).newPage();
  await irina.goto("/staff");
  const row = irina.getByRole("listitem").filter({ hasText: number });
  await expect(row).toContainText("4МЭО-1");
  await row.getByRole("link").click();
  await expect(irina.getByRole("heading", { level: 1 })).toHaveText(
    "Справка об обучении на английском",
  );
  await expect(irina.getByText(marker)).toBeVisible();
  await noHorizontalScroll(irina, "карточка заявки у сотрудника");
  await irina.getByLabel(/Комментарий студенту/).fill("Подготовим к пятнице");
  await irina.getByRole("button", { name: "Принять" }).click();
  await expect(irina.getByRole("status")).toContainText("Статус изменён");

  await timur.reload();
  await expect(timur.getByText("Принята", { exact: true }).first()).toBeVisible();

  // «В работе» → «Готова»
  await irina.getByRole("button", { name: "Взять в работу" }).click();
  await expect(irina.getByRole("button", { name: "Отметить готовой" })).toBeVisible();
  await irina.getByRole("button", { name: "Отметить готовой" }).click();
  await expect(irina.getByRole("button", { name: "Выдать справку" })).toBeVisible();

  // Тимур получает уведомление (колокольчик есть только на десктопе — на 360 идём через «Ещё»)
  await timur.goto("/more");
  await timur
    .getByRole("main")
    .getByRole("link", { name: /Уведомления/ })
    .click();
  await expect(timur).toHaveURL(/\/notifications/);
  const note = timur
    .locator(`[data-notification][data-link="${requestUrl(number)}"]`)
    .filter({ hasText: "Справка готова" });
  await expect(note).toHaveCount(1);
  await note.getByRole("button").click();
  await expect(timur).toHaveURL(new RegExp(`${escape(requestUrl(number))}$`));
  await expect(timur.getByText("Готова — заберите").first()).toBeVisible();
  await expect(timur.getByText("Подготовим к пятнице")).toBeVisible();
  await noHorizontalScroll(timur, "готовая заявка");

  // Скачивает PDF с QR
  const link = timur.getByRole("link", { name: "Скачать справку (PDF)" });
  const [download] = await Promise.all([timur.waitForEvent("download"), link.click()]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  const res = await timur.request.get((await link.getAttribute("href"))!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  const pdf = await res.body();
  const token = pdfTextVariants(pdf)
    .map((t) => /\/verify\/([A-Za-z0-9_-]{22})/.exec(t)?.[1])
    .find(Boolean);
  expect(token, "в PDF есть ссылка проверки /verify/<токен>").toBeTruthy();

  // ── 5. Проверка подлинности: кто угодно (без входа) открывает адрес из QR
  const anon = await (await browser.newContext({ storageState: ANON })).newPage();
  const verify = await anon.goto(`/verify/${token}`);
  expect(verify?.status()).toBe(200);
  await expect(anon.getByRole("heading", { level: 1 })).toHaveText("Справка действительна");
  await expect(anon.getByText("Справка об обучении на английском")).toBeVisible();
  const today = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
  await expect(anon.locator("dd").filter({ hasText: today }).first()).toBeVisible();
  // Без лишних персональных данных (S7): владелец — «Фамилия И. О.» (английская справка — латиницей),
  // ни полного имени, ни группы, ни номера заявки, ни того, что студент вписал в форму
  await expect(anon.locator("dd").filter({ hasText: /^Galiev T\. [A-Z]\.$/ })).toHaveCount(1);
  const body = await anon.getByRole("main").innerText();
  for (const leak of ["Тимур", "Timur", "4МЭО-1", "МЭО", number, marker]) {
    expect(body, `на /verify нет «${leak}»`).not.toContain(leak);
  }
  await noHorizontalScroll(anon, "/verify");
});

test("сценарий 6 «Изоляция»: Вера подставляет в адрес номер заявки Тимура → 404", async ({
  browser,
}) => {
  // Номер берём из ленты Тимура (его собственная сессия), а не из сида
  const timur = await demoLogin(browser, "Тимур");
  await bottomNav(timur).getByRole("link", { name: "Заявки" }).click();
  const href = await timur
    .locator('main a[href^="/requests/%D0%A1-"]')
    .first()
    .getAttribute("href");
  expect(href).toBeTruthy();
  const number = decodeURIComponent(href!.split("/").pop()!);

  const vera = await demoLogin(browser, "Вера");
  const res = await vera.goto(href!);
  expect(res?.status()).toBe(404);
  await expect(vera.getByRole("heading", { name: "Такой заявки у вас нет" })).toBeVisible();
  await expect(vera.getByRole("main")).not.toContainText(number);
  expect((await vera.request.get(`${href}/pdf`)).status()).toBe(404);
  await noHorizontalScroll(vera, "404 заявки");
});
