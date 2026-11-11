// Запись экрана для видео-демонстрации (T14): сцены из docs/report/video/script.md — сценарием Playwright
// на локальной прод-сборке против базы protokol_e2e (ровно сид). После записи базу пересевает человек или
// скрипт (`pnpm exec tsx tests/e2e/prepare-db.ts`). В сам сайт ничего не добавляется: «касание» — кружок,
// который скрипт рисует в записываемом браузере (как курсор в обычной записи экрана).
//
// Запуск: E2E_DATABASE_URL=… node scripts/video/record.mjs <папка вывода> [chrome-headless-shell.exe]
// Сервер: PORT=3000 DEMO_MODE=1 ASSISTANT_PROVIDER=faq pnpm start (DATABASE_URL — база e2e).
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const pg = require("pg");

const BASE = process.env.VIDEO_BASE_URL ?? "http://localhost:3000";
const OUT = path.resolve(process.argv[2] ?? "video-out");
const EXE = process.argv[3];
const DB = process.env.E2E_DATABASE_URL;
if (!DB || !/protokol_e2e/.test(DB)) throw new Error("Нужен E2E_DATABASE_URL базы protokol_e2e");
mkdirSync(OUT, { recursive: true });

// Запись Playwright снимает в CSS-пикселях: deviceScaleFactor 2 даёт картинку в четверти кадра — пишем 1:1
const PHONE = { viewport: { width: 390, height: 844 }, scale: 1, mobile: true };
const DESK = { viewport: { width: 1280, height: 800 }, scale: 1, mobile: false };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const marks = {};

async function sql(text, params = []) {
  const c = new pg.Client({ connectionString: DB });
  await c.connect();
  try {
    return (await c.query(text, params)).rows;
  } finally {
    await c.end();
  }
}

const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});

/** Вход демо-кнопкой — без записи; сохраняем сессию для контекстов сцен. */
async function loginState(who, device) {
  const ctx = await browser.newContext({
    viewport: device.viewport,
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
  });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`);
  await Promise.all([
    p.waitForURL((u) => !u.pathname.startsWith("/login")),
    p.getByRole("button", { name: `Войти как ${who}` }).click(),
  ]);
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

/** Контекст сцены с записью видео; t0 — момент создания страницы (начало файла видео). */
async function sceneContext(name, device, storageState, scheme = "light") {
  const size = {
    width: device.viewport.width * device.scale,
    height: device.viewport.height * device.scale,
  };
  const ctx = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.scale,
    isMobile: device.mobile,
    hasTouch: device.mobile,
    colorScheme: scheme,
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    serviceWorkers: "block",
    ...(storageState ? { storageState } : {}),
    recordVideo: { dir: path.join(OUT, "raw"), size },
  });
  const page = await ctx.newPage();
  return { ctx, page, t0: Date.now(), name };
}

/** Начало полезной части сцены: всё до этого обрежет сборка. */
function ready(s) {
  marks[s.name] = { ...(marks[s.name] ?? {}), start: (Date.now() - s.t0) / 1000 };
}

async function finish(s) {
  const video = s.page.video();
  await s.ctx.close();
  const file = path.join(OUT, `${s.name}.webm`);
  await video.saveAs(file);
  marks[s.name] = { ...(marks[s.name] ?? {}), file };
  // После каждой сцены — на диск: сбой следующей не теряет отметки готовых
  writeFileSync(path.join(OUT, "marks.json"), JSON.stringify(marks, null, 2));
}

/** Кружок «касания» в записываемом браузере, затем клик. */
async function tap(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box) {
    await page.evaluate(
      ({ x, y }) => {
        const d = document.createElement("div");
        Object.assign(d.style, {
          position: "fixed",
          left: `${x - 22}px`,
          top: `${y - 22}px`,
          width: "44px",
          height: "44px",
          borderRadius: "50%",
          background: "rgba(31, 34, 217, 0.28)",
          border: "2px solid rgba(31, 34, 217, 0.7)",
          zIndex: "2147483647",
          pointerEvents: "none",
          transition: "transform 450ms ease-out, opacity 450ms ease-out",
        });
        document.body.appendChild(d);
        requestAnimationFrame(() => {
          d.style.transform = "scale(1.6)";
          d.style.opacity = "0";
        });
        setTimeout(() => d.remove(), 600);
      },
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    );
    await pause(350);
  }
  await locator.click();
}

/** Плавная прокрутка к элементу (по центру экрана). */
async function glide(page, locator, wait = 1500) {
  await locator.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
  await pause(wait);
}

async function scrollBy(page, dy, wait = 1500) {
  await page.evaluate((y) => window.scrollBy({ top: y, behavior: "smooth" }), dy);
  await pause(wait);
}

const type = (locator, text, delay = 35) => locator.pressSequentially(text, { delay });

// ── Сессии ──
const alisa = await loginState("Алиса", PHONE);
const timur = await loginState("Тимур", PHONE);
const irina = await loginState("Ирина", DESK);

// ── 1. Вход ──
{
  const s = await sceneContext("s01-phone", PHONE, null);
  await s.page.goto(`${BASE}/login`);
  ready(s);
  await pause(4000);
  await scrollBy(s.page, 500, 3500);
  await scrollBy(s.page, -500, 2500);
  await pause(3000);
  await tap(s.page, s.page.getByRole("button", { name: "Войти как Алиса" }));
  await s.page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await pause(3000);
  await finish(s);
}

// ── 2. «Сейчас» ──
{
  const s = await sceneContext("s02-phone", PHONE, alisa);
  await s.page.goto(`${BASE}/`);
  ready(s);
  await pause(5000);
  await glide(s.page, s.page.getByRole("region", { name: "Изменения", exact: true }), 5000);
  await glide(s.page, s.page.getByRole("region", { name: "Скоро" }), 3500);
  const offer = s.page.getByRole("region", { name: "Деканат предлагает" });
  await glide(s.page, offer, 6000);
  await tap(s.page, offer.getByRole("button", { name: "Подать заявление" }));
  await s.page.waitForURL(/\/requests\//);
  await pause(1200);
  await glide(s.page, s.page.getByText(/Заявку предложил деканат/), 4500);
  await finish(s);
}

// ── 3. «Учёба» Тимура ──
{
  const s = await sceneContext("s03-phone", PHONE, timur);
  await s.page.goto(`${BASE}/grades`);
  ready(s);
  await pause(4500);
  await scrollBy(s.page, 420, 4000);
  await scrollBy(s.page, 420, 4000);
  await scrollBy(s.page, 420, 4500);
  await finish(s);
}

// ── 4. Справка для визы: Алиса (телефон) + Ирина (компьютер), одновременно ──
let visaNumber;
{
  const a = await sceneContext("s04-phone", PHONE, alisa);
  const i = await sceneContext("s04-desk", DESK, irina);
  await Promise.all([a.page.goto(`${BASE}/requests`), i.page.goto(`${BASE}/staff`)]);
  ready(a);
  ready(i);
  await pause(1500);
  await tap(a.page, a.page.getByRole("link", { name: "Заказать справку" }).first());
  await a.page.waitForURL(/\/requests\/new$/);
  await pause(1500);
  await tap(a.page, a.page.getByRole("link", { name: /^Виза/ }));
  await pause(1500);
  await tap(
    a.page,
    a.page
      .getByRole("list", { name: "Справки для цели «Виза»" })
      .getByRole("link", { name: "Справка об обучении на английском" }),
  );
  await pause(1000);
  await type(a.page.getByLabel(/Addressee/), "Embassy of France");
  await pause(600);
  await tap(a.page, a.page.getByRole("button", { name: "Отправить заявку" }));
  await a.page.waitForURL(/\/requests\/%D0%A1-\d{4}-\d{5}$/);
  visaNumber = decodeURIComponent(new URL(a.page.url()).pathname.split("/").pop());
  await pause(2500);
  // Ирина: брифинг уже на экране → строка заявки Алисы → шаги
  await i.page.reload();
  await pause(1500);
  const row = i.page.getByRole("listitem").filter({ hasText: visaNumber });
  await glide(i.page, row, 1200);
  await tap(i.page, row.getByRole("link"));
  await i.page.waitForURL(/\/staff\/requests\//);
  await pause(1500);
  await tap(i.page, i.page.getByRole("button", { name: "Принять" }));
  await pause(1800);
  await tap(i.page, i.page.getByRole("button", { name: "Взять в работу" }));
  await pause(1800);
  await tap(i.page, i.page.getByRole("button", { name: "Подготовить черновик" }));
  await pause(2200);
  await tap(i.page, i.page.getByRole("button", { name: "Отметить готовой" }));
  await pause(2500);
  await finish(a);
  await finish(i);
}

// ── 5. Уведомление → справка → проверка по QR ──
{
  const [{ token }] = await sql(
    `SELECT d."verifyToken" AS token FROM "IssuedDocument" d JOIN "Request" r ON r.id = d."requestId"
      WHERE r.number = $1`,
    [visaNumber],
  );
  const s = await sceneContext("s05-phone", PHONE, alisa);
  await s.page.goto(`${BASE}/notifications`);
  ready(s);
  await pause(2500);
  const note = s.page.locator("[data-notification]").filter({ hasText: "Справка готова" }).first();
  await tap(s.page, note.getByRole("button"));
  await s.page.waitForURL(/\/requests\//);
  await pause(2000);
  await glide(s.page, s.page.getByRole("link", { name: "Скачать справку (PDF)" }), 3500);
  await s.page.goto(`${BASE}/verify/${token}`);
  await pause(7000);
  await scrollBy(s.page, 300, 3000);
  await finish(s);
}

// ── 6. Деканат: пачка + база ответов ──
{
  const [{ number: visaSource }] = await sql(
    `SELECT r.number FROM "Request" r JOIN "RequestType" t ON t.id = r."typeId"
      WHERE r."studentId" = 'stu-savelev' AND t.code = 'embassy' AND r.status = 'ISSUED'`,
  );
  const s = await sceneContext("s06-desk", DESK, irina);
  await s.page.goto(`${BASE}/staff`);
  ready(s);
  await pause(1500);
  await tap(s.page, s.page.getByRole("button", { name: /^Выбрать «В работе» \(\d+\)$/ }));
  await pause(1500);
  await tap(
    s.page,
    s.page.getByRole("button", { name: /^Отметить готов\p{L}+ \d+ заяв\p{L}*…$/u }),
  );
  await pause(2500);
  await tap(s.page, s.page.getByRole("dialog").getByRole("button", { name: /^Отметить готов/ }));
  await pause(2500);
  await s.page.goto(`${BASE}/staff/requests/${encodeURIComponent(visaSource)}`);
  await pause(800);
  await glide(s.page, s.page.getByRole("region", { name: "Ответ помощника" }), 1500);
  await tap(s.page, s.page.getByRole("button", { name: "Сделать ответом помощника" }));
  await s.page.waitForURL(/\/staff\/answers\//);
  await pause(1500);
  const q = s.page.getByLabel("Вопрос");
  await q.fill("");
  await type(q, "Нужен ли перевод справки для визы во Францию?", 30);
  await s.page
    .getByLabel("Ключевые слова")
    .fill("перевод справки, виза, франция, консульство, французский");
  // Ответ — без «Справка готова.» из ответа конкретному студенту: это ответ для всех
  await s.page
    .getByLabel("Ответ", { exact: true })
    .fill(
      "Для визы во Францию консульству достаточно справки на английском. Перевод на французский " +
        "деканат не делает: если консульство всё же попросит, нужен нотариальный перевод, это 1–2 дня.",
    );
  await pause(1200);
  await tap(s.page, s.page.getByRole("button", { name: "Опубликовать" }));
  await pause(3000);
  await finish(s);
}

// ── 7. Помощник ──
{
  const s = await sceneContext("s07-phone", PHONE, alisa);
  await s.page.goto(`${BASE}/assistant`);
  ready(s);
  await pause(800);
  const ask = async (text) => {
    const field = s.page.getByRole("textbox", { name: "Ваш вопрос" });
    await type(field, text, 25);
    // Ответ готов, когда в журнале прибавилась реплика и журнал больше не «занят»: одной проверки aria-busy
    // мало — до отправки он тоже false (первый дубль закончился на недописанном вопросе)
    const log = s.page.getByRole("log", { name: "Разговор с помощником" });
    const before = await log.locator(":scope > ol > li").count();
    await tap(s.page, s.page.getByRole("button", { name: "Спросить" }));
    await s.page.waitForFunction((n) => {
      const l = document.querySelector('[role="log"]');
      return (
        l?.getAttribute("aria-busy") === "false" &&
        l.querySelectorAll(":scope > ol > li").length >= n + 2
      );
    }, before);
  };
  await ask("Нужен ли перевод справки для визы во Францию?");
  await pause(4000);
  await ask("Когда ближайший экзамен?");
  await pause(3500);
  await finish(s);
}

// ── 8. Перенос пары: аудитория занята → свободные ──
{
  const [l] = await sql(
    `SELECT l.id, l."startsAt", l.building, l.room, l."teacherId", l."disciplineId", l."groupId"
       FROM "Lesson" l JOIN "Group" g ON g.id = l."groupId"
      WHERE g.name = '2МО-3' AND l.change = 'NONE' AND l."startsAt" > now() + interval '1 day'
      ORDER BY l."startsAt" LIMIT 1`,
  );
  const msk = (d) => new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
  const target = new Date(Date.now() + 3 * 86400_000);
  const day = msk(target);
  const at = new Date(`${day}T20:00:00+03:00`);
  await sql(
    `INSERT INTO "Lesson" (id, "disciplineId", "teacherId", kind, "startsAt", "endsAt", building, room, change)
     SELECT 'video-block', $1, t.id, 'SEMINAR', $2, $3, $4, $5, 'NONE'
       FROM "Teacher" t WHERE t.id <> $6 ORDER BY t.id LIMIT 1`,
    [
      l.disciplineId,
      at.toISOString(),
      new Date(+at + 80 * 60_000).toISOString(),
      l.building,
      l.room,
      l.teacherId,
    ],
  );
  const s = await sceneContext("s08-desk", DESK, irina);
  await s.page.goto(`${BASE}/staff/schedule?group=${l.groupId}&day=${msk(new Date(l.startsAt))}`);
  ready(s);
  await pause(1000);
  await tap(
    s.page,
    s.page.locator(`[data-lesson="${l.id}"]`).getByRole("button", { name: /^Перенести:/ }),
  );
  const d = s.page.getByRole("dialog");
  await pause(700);
  await d.getByLabel("Дата").fill(day);
  await d.getByLabel("Начало").fill("20:00");
  await type(d.getByLabel("Причина"), "Аудитория нужна под защиту курсовых", 20);
  await tap(s.page, d.getByRole("button", { name: "Перенести пару" }));
  await pause(2500);
  await tap(
    s.page,
    d
      .getByRole("group", { name: /^Свободны с/ })
      .getByRole("button")
      .first(),
  );
  await pause(1000);
  await tap(s.page, d.getByRole("button", { name: "Перенести пару" }));
  await pause(2000);
  await finish(s);
  await sql(`DELETE FROM "Lesson" WHERE id = 'video-block'`);
}

// ── 9. Оценка + «Что говорят студенты» ──
{
  const [{ number: ready1 }] = await sql(
    `SELECT number FROM "Request" WHERE "studentId" = 'stu-alisa' AND status = 'READY' AND rating IS NULL
      ORDER BY "createdAt" LIMIT 1`,
  );
  const a = await sceneContext("s09-phone", PHONE, alisa);
  const i = await sceneContext("s09-desk", DESK, irina);
  await Promise.all([
    a.page.goto(`${BASE}/requests/${encodeURIComponent(ready1)}`),
    i.page.goto(`${BASE}/staff`),
  ]);
  ready(a);
  ready(i);
  const rate = a.page.getByRole("region", { name: "Как вам работа деканата?" });
  await glide(a.page, rate, 1000);
  await tap(a.page, rate.locator("label").filter({ hasText: /^5/ }));
  await pause(500);
  await tap(a.page, rate.getByRole("button", { name: "Отправить оценку" }));
  await pause(2000);
  await glide(i.page, i.page.getByRole("region", { name: "Что говорят студенты" }), 4000);
  await finish(a);
  await finish(i);
}

// ── 10. Безопасность и качество ──
{
  const s = await sceneContext("s10-phone", PHONE, alisa);
  await s.page.goto(`${BASE}/requests/${encodeURIComponent("С-2026-99999")}`);
  ready(s);
  await pause(4500);
  await s.page.goto(`${BASE}/more`);
  await pause(1200);
  const dark = s.page.getByRole("radio", { name: "Тёмная" });
  await dark.scrollIntoViewIfNeeded();
  await tap(s.page, s.page.locator("label").filter({ has: dark }).first());
  await pause(2000);
  await s.page.goto(`${BASE}/`);
  await pause(2500);
  await s.page.evaluate(async () => {
    document.documentElement.style.fontSize = "200%";
    await document.fonts.ready;
  });
  await pause(4000);
  await scrollBy(s.page, 600, 4000);
  // Тему возвращаем: сессия Алисы общая со следующими записями
  await s.page.goto(`${BASE}/more`);
  await s.page.getByRole("radio", { name: "Системная" }).check({ force: true });
  await finish(s);
}

writeFileSync(path.join(OUT, "marks.json"), JSON.stringify(marks, null, 2));
await browser.close();
console.log(`записано сцен: ${Object.keys(marks).length} → ${OUT}`);
