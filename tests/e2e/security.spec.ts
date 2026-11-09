// Обязательные тесты безопасности из docs/05-security.md (8 штук) + проверки входа и сессий T03.
// Секреты: значения берутся из окружения и НИКОГДА не попадают в сообщения об ошибке — только имя переменной.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { STORAGE } from "../../playwright.config";
import { ACCOUNTS, ANON, fillLogin, loginAs, randomIpHeaders } from "./helpers/auth";
import { deleteTestRequests, withDb } from "./helpers/db";
import { setTextScale } from "./helpers/text-scale";

const SESSION = "__Host-session";

/** Новая анонимная вкладка — чтобы не трогать общие сессии Алисы и Ирины из setup. */
async function freshPage(browser: Browser, headers?: Record<string, string>): Promise<Page> {
  const ctx = await browser.newContext({ storageState: ANON, extraHTTPHeaders: headers });
  return ctx.newPage();
}

/** Заявки тестов 1–2 — удаляются после файла: база e2e общая для параллельных тестов (T08, T13). */
const created: string[] = [];
test.afterAll(async () => {
  await deleteTestRequests(created);
});

/** Вход Тимура демо-кнопкой: тестам 1–2 не нужен пароль, а повторные входы по паролю упираются в лимит. */
async function demoLoginAsTimur(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Войти как Тимур" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test.describe("05-security: обязательные тесты", () => {
  test("1. Студент Б открывает /requests/<номер заявки А> → 404, данных заявки в ответе нет", async ({
    page,
    browser,
  }) => {
    // Номер и данные заявки Алисы — из её же сессии, после загрузки (урок T05), а не из сида
    await page.goto("/requests");
    const link = page.getByRole("list", { name: "Активные заявки" }).getByRole("link").first();
    await expect(link).toBeVisible();
    const href = (await link.getAttribute("href"))!;
    const number = decodeURIComponent(href.split("/").pop()!);
    await page.goto(href);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const given = await page
      .getByRole("region", { name: "Что вы указали" })
      .locator("dd")
      .last()
      .innerText();
    expect(given.length).toBeGreaterThan(3);

    const timur = await freshPage(browser);
    await demoLoginAsTimur(timur);
    const res = await timur.goto(href);
    expect(res?.status()).toBe(404);
    await expect(timur.getByRole("heading", { name: "Такой заявки у вас нет" })).toBeVisible();
    await expect(timur.getByRole("main")).not.toContainText(number);
    expect(await timur.content()).not.toContain(given);
    expect(await timur.title()).not.toContain(number);
  });

  test("2. Студент Б вызывает Server Action отмены заявки А → ошибка, заявка не изменилась", async ({
    page,
    browser,
  }) => {
    const submit = async (p: Page) => {
      await p.goto("/requests/new?type=study_ru");
      await p.getByLabel("Куда предоставляется").fill(`e2e-sec-${randomBytes(4).toString("hex")}`);
      await p.getByRole("button", { name: "Отправить заявку" }).click();
      await expect(p).toHaveURL(/\/requests\/%D0%A1-/);
      const n = decodeURIComponent(new URL(p.url()).pathname.split("/").pop()!);
      created.push(n);
      return n;
    };
    const alisaNumber = await submit(page);

    // Тимур открывает СВОЮ заявку, подменяет номер в форме отмены на номер Алисы и отправляет —
    // ровно то, что сделал бы злоумышленник с настоящим Server Action
    const timur = await freshPage(browser);
    await demoLoginAsTimur(timur);
    const timurNumber = await submit(timur);
    await timur.getByRole("button", { name: "Отменить заявку" }).click();
    const dialog = timur.getByRole("dialog");
    await dialog.locator('input[name="number"]').evaluate((el, n) => {
      (el as HTMLInputElement).value = n;
    }, alisaNumber);
    await dialog.getByRole("button", { name: "Отменить заявку" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Отменить нельзя");

    // Заявка Алисы — по-прежнему «Подана» (смотрим под Алисой), заявка Тимура тоже не тронута
    await page.goto(`/requests/${encodeURIComponent(alisaNumber)}`);
    await expect(page.getByRole("button", { name: "Отменить заявку" })).toBeVisible();
    await expect(page.getByText("Отменена", { exact: true })).toHaveCount(0);
    await timur.goto(`/requests/${encodeURIComponent(timurNumber)}`);
    await expect(timur.getByRole("button", { name: "Отменить заявку" })).toBeVisible();
  });

  test("3. Студент открывает /staff → не видит кабинет сотрудника", async ({ page }) => {
    const res = await page.goto("/staff");
    expect(res?.status()).toBeLessThan(500);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("navigation", { name: "Разделы кабинета" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Очередь заявок" })).toHaveCount(0);
  });

  test("3а. Студент открывает /staff/announcements и /staff/schedule → не видит кабинет (T09)", async ({
    page,
  }) => {
    for (const route of ["/staff/announcements", "/staff/schedule"]) {
      const res = await page.goto(route);
      expect(res?.status(), route).toBeLessThan(500);
      await expect(page, route).toHaveURL(/\/$/);
      await expect(page.getByRole("navigation", { name: "Разделы кабинета" })).toHaveCount(0);
    }
  });

  test.describe("4. Неавторизованный", () => {
    test.use({ storageState: ANON });
    for (const route of ["/", "/grades", "/staff", "/requests", "/profile", "/assistant"]) {
      test(`${route} → /login`, async ({ page }) => {
        await page.goto(route);
        await expect(page).toHaveURL(/\/login$/);
        await expect(
          page.getByRole("heading", { level: 1, name: "Вход в Протокол" }),
        ).toBeVisible();
      });
    }
  });

  test("5. В HTML и JS-бандлах нет значений секретов из окружения", async ({ page, request }) => {
    const secrets: [string, string][] = [];
    for (const name of [
      "SEED_PASSWORD_ALISA",
      "SEED_PASSWORD_TIMUR",
      "SEED_PASSWORD_VERA",
      "SEED_PASSWORD_IRINA",
      "GIGACHAT_AUTH_KEY",
      "DATABASE_URL",
    ]) {
      const v = process.env[name];
      if (v && v.length >= 6) secrets.push([name, v]);
    }
    const dbPassword = process.env.DATABASE_URL
      ? decodeURIComponent(new URL(process.env.DATABASE_URL).password)
      : "";
    if (dbPassword.length >= 12) secrets.push(["пароль из DATABASE_URL", dbPassword]);
    expect(secrets.length, "в окружении должны быть хотя бы пароли сида").toBeGreaterThan(0);

    // HTML: страница входа анонимно и разделы под Алисой (этот тест — с её сессией)
    const pages: string[] = [];
    pages.push(await (await request.get("/login", { headers: { cookie: "" } })).text());
    for (const route of ["/", "/grades", "/more", "/profile", "/assistant"]) {
      await page.goto(route);
      pages.push(await page.content());
    }
    // Ответ помощника (T12) — тоже «страница»: ключ GigaChat не должен попасть и в него
    const reply = await page.request.post("/api/assistant", {
      data: { messages: [{ role: "user", content: "Как оформить академ?" }] },
    });
    expect(reply.status()).toBe(200);
    pages.push(await reply.text());

    // JS и CSS бандлы прод-сборки — с диска (.next/static), все файлы
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(js|css|json|html)$/.test(e.name)) files.push(p);
      }
    };
    walk(join(process.cwd(), ".next", "static"));
    expect(files.length).toBeGreaterThan(0);

    const leaks: string[] = [];
    for (const [name, value] of secrets) {
      if (pages.some((html) => html.includes(value))) leaks.push(`${name} — в HTML`);
      for (const f of files) {
        if (readFileSync(f, "utf8").includes(value)) leaks.push(`${name} — в ${f}`);
      }
    }
    // Только имена переменных и файлов, без значений
    expect(leaks).toEqual([]);
  });

  test("6. В БД у всех пользователей passwordHash начинается с $argon2id$", async () => {
    const { rows } = await withDb((c) =>
      c.query<{ total: string; bad: string }>(
        `SELECT count(*) AS total,
                count(*) FILTER (WHERE "passwordHash" NOT LIKE '$argon2id$%') AS bad
           FROM "User"`,
      ),
    );
    expect(Number(rows[0]!.total)).toBeGreaterThan(0);
    expect(Number(rows[0]!.bad)).toBe(0);
  });

  test("7. 6 неверных паролей подряд → блокировка", async ({ browser }) => {
    // Случайный несуществующий логин: не блокируем аккаунты жюри для соседних тестов,
    // и заодно видно, что блокировка не выдаёт, существует ли логин
    const ip = randomIpHeaders();
    const page = await freshPage(browser, ip);
    const login = `e2e.lock.${randomBytes(4).toString("hex")}`;
    await page.goto("/login");
    for (let i = 1; i <= 5; i++) {
      await fillLogin(page, login, `wrong-${i}`);
      await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    }
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Слишком много попыток");
    await fillLogin(page, login, "wrong-6");
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Слишком много попыток");

    // Блокировка — на пару «логин + IP», а не на IP: Тимур с того же адреса входит
    const other = await freshPage(browser, ip);
    await loginAs(other, "timur");
  });

  test("8. /verify/<token> не содержит номера зачётки и оценок", async ({ browser }) => {
    // Секреты Алисы — из БД: номер зачётки, полное имя, дисциплины с оценками и баллы
    const alisa = await withDb(async (c) => {
      const doc = await c.query<{ token: string }>(
        `SELECT d."verifyToken" AS token FROM "IssuedDocument" d JOIN "Request" r ON r.id = d."requestId"
          WHERE r."studentId" = 'stu-alisa' AND NOT d.revoked ORDER BY d."issuedAt" LIMIT 1`,
      );
      const st = await c.query<{
        recordBookNo: string;
        firstName: string;
        middleName: string | null;
      }>(`SELECT "recordBookNo", "firstName", "middleName" FROM "Student" WHERE id = 'stu-alisa'`);
      const grades = await c.query<{ name: string }>(
        `SELECT DISTINCT d.name FROM "Grade" g JOIN "Discipline" d ON d.id = g."disciplineId"
          WHERE g."studentId" = 'stu-alisa' AND (g."finalMark" IS NOT NULL OR g."ratingPoints" IS NOT NULL)`,
      );
      return {
        token: doc.rows[0]?.token,
        ...st.rows[0]!,
        disciplines: grades.rows.map((r) => r.name),
      };
    });
    expect(alisa.token, "у Алисы в сиде есть выданная справка").toBeTruthy();
    expect(alisa.disciplines.length, "у Алисы в сиде есть оценки").toBeGreaterThan(0);

    // Положительный контроль: те же строки на её странице «Учёба» есть — поиск их бы нашёл
    const own = await (await browser.newContext({ storageState: STORAGE.alisa })).newPage();
    await own.goto("/grades");
    expect(await own.content()).toContain(alisa.disciplines[0]);

    const anon = await (await browser.newContext({ storageState: ANON })).newPage();
    const res = await anon.goto(`/verify/${alisa.token}`);
    expect(res?.status()).toBe(200);
    await expect(anon.getByRole("heading", { level: 1 })).toHaveText("Справка действительна");
    const html = await anon.content();
    expect(html).not.toContain(alisa.recordBookNo);
    expect(html).not.toContain(alisa.firstName);
    if (alisa.middleName) expect(html).not.toContain(alisa.middleName);
    for (const d of alisa.disciplines) expect(html, d).not.toContain(d);
    expect(html).not.toMatch(/зачётк|рейтинг|оценк/i);
  });
});

test.describe("T13: в ответах страниц нет секретных полей (из security-ревью T02)", () => {
  /**
   * Имена полей и значения из БД: зачётки и токены календаря всех студентов, начало хеша пароля.
   * Ищем и в HTML (там же встроенный RSC-поток), и в RSC-ответе клиентской навигации.
   */
  async function secrets() {
    return withDb(async (c) => {
      const st = await c.query<{ recordBookNo: string; calendarToken: string }>(
        `SELECT "recordBookNo", "calendarToken" FROM "Student"`,
      );
      const doc = await c.query<{ token: string; number: string }>(
        `SELECT d."verifyToken" AS token, r.number FROM "IssuedDocument" d
           JOIN "Request" r ON r.id = d."requestId"
          WHERE r."studentId" = 'stu-alisa' AND NOT d.revoked ORDER BY d."issuedAt" LIMIT 1`,
      );
      expect(st.rows.length, "в сиде есть студенты").toBeGreaterThan(0);
      expect(doc.rows[0], "у Алисы в сиде есть выданная справка").toBeTruthy();
      const values: [string, string][] = st.rows.flatMap((r, i): [string, string][] => [
        [`номер зачётки студента №${i + 1}`, r.recordBookNo],
        [`токен календаря студента №${i + 1}`, r.calendarToken],
      ]);
      return { values, verifyToken: doc.rows[0]!.token, alisaRequest: doc.rows[0]!.number };
    });
  }

  const FIELD_NAMES = ["$argon2id$", "passwordHash", "recordBookNo", "calendarToken"];

  /** Тексты HTML и RSC-ответа; в сообщениях — только адрес и название находки, без значений. */
  async function leaksOn(page: Page, path: string, values: [string, string][]): Promise<string[]> {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    const html = await page.content();
    const rsc = await (await page.request.get(path, { headers: { RSC: "1" } })).text();
    const found: string[] = [];
    for (const [kind, body] of [
      ["HTML", html],
      ["RSC", rsc],
    ] as const) {
      for (const f of FIELD_NAMES) if (body.includes(f)) found.push(`${path} ${kind}: «${f}»`);
      for (const [name, v] of values)
        if (v && body.includes(v)) found.push(`${path} ${kind}: ${name}`);
    }
    return found;
  }

  test("/staff, /staff/requests/<номер>, /requests, /requests/<номер>, /verify/<токен>", async ({
    browser,
  }) => {
    const { values, verifyToken, alisaRequest } = await secrets();
    const leaks: string[] = [];

    const alisa = await (await browser.newContext({ storageState: STORAGE.alisa })).newPage();
    leaks.push(...(await leaksOn(alisa, "/requests", values)));
    leaks.push(...(await leaksOn(alisa, `/requests/${encodeURIComponent(alisaRequest)}`, values)));
    // Положительный контроль: в профиле свой токен календаря показан намеренно — поиск его находит
    expect((await leaksOn(alisa, "/profile", values)).length).toBeGreaterThan(0);

    const irina = await (await browser.newContext({ storageState: STORAGE.irina })).newPage();
    leaks.push(...(await leaksOn(irina, "/staff", values)));
    // Первая заявка очереди Ирины — та, что сотрудник реально открывает (свой факультет)
    await irina.goto("/staff");
    const href = await irina
      .locator('main a[href^="/staff/requests/"]')
      .first()
      .getAttribute("href");
    expect(href, "в очереди Ирины есть заявки").toBeTruthy();
    leaks.push(...(await leaksOn(irina, href!, values)));

    const anon = await (await browser.newContext({ storageState: ANON })).newPage();
    leaks.push(...(await leaksOn(anon, `/verify/${verifyToken}`, values)));

    expect(leaks).toEqual([]);
  });
});

test.describe("вход и сессии (T03)", () => {
  test.use({ storageState: ANON });

  test("cookie сессии: __Host-, HttpOnly, Secure, SameSite=Lax, Path=/; JS её не видит", async ({
    page,
    context,
  }) => {
    await loginAs(page, "timur");
    const cookie = (await context.cookies()).find((c) => c.name === SESSION);
    expect(cookie).toBeDefined();
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", path: "/" });
    expect(cookie!.expires).toBeGreaterThan(Date.now() / 1000 + 6 * 24 * 3600);
    expect(await page.evaluate(() => document.cookie)).not.toContain(SESSION);
  });

  test("одна и та же ошибка для «нет логина» и «неверный пароль»", async ({ browser }) => {
    const page = await freshPage(browser, randomIpHeaders());
    await page.goto("/login");
    // student.savelev существует (фоновый студент сида), но его пароль никто не знает
    await fillLogin(page, "student.savelev", "wrong-password");
    const wrong = await page.getByRole("main").getByRole("alert").innerText();
    await fillLogin(page, `student.nobody${randomBytes(3).toString("hex")}`, "wrong-password");
    const ghost = await page.getByRole("main").getByRole("alert").innerText();
    expect(wrong).toContain("Неверный логин или пароль");
    expect(ghost).toBe(wrong);
  });

  test("пустые поля — ошибки у полей, логин после ошибки остаётся в поле", async ({ browser }) => {
    const page = await freshPage(browser, randomIpHeaders());
    await page.goto("/login");
    await page.getByRole("button", { name: "Войти", exact: true }).click();
    await expect(page.getByText("Введите логин")).toBeVisible();
    await expect(page.getByText("Введите пароль")).toBeVisible();
    await expect(page.getByLabel("Логин")).toHaveAttribute("aria-invalid", "true");

    await fillLogin(page, "student.savelev", "x");
    await expect(page.getByLabel("Логин")).toHaveValue("student.savelev");
    await expect(page.getByLabel("Пароль", { exact: true })).toHaveValue("");
  });

  // Подложить cookie сессии в браузер. Chromium не даёт задать Secure-cookie для http://-адреса,
  // но принимает её для того же хоста по https:// — и шлёт на http://localhost (безопасный контекст)
  async function putSessionCookie(ctx: BrowserContext, baseURL: string, token: string) {
    const url = new URL(baseURL);
    url.protocol = "https:";
    await ctx.addCookies([
      {
        name: SESSION,
        value: token,
        url: url.origin,
        secure: true,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  }

  test("поддельная cookie: proxy пропускает, но сервер отправляет на /login", async ({
    browser,
    baseURL,
    playwright,
  }) => {
    const ctx = await browser.newContext({ storageState: ANON });
    await putSessionCookie(ctx, baseURL!, randomBytes(32).toString("base64url"));
    const page = await ctx.newPage();
    await page.goto("/grades");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Учёба" })).toHaveCount(0);

    // Без cookie редиректит proxy (307 сразу), с поддельной — уже guard на сервере:
    // ответ без содержимого страницы, только инструкция NEXT_REDIRECT на /login
    const api = await playwright.request.newContext({ baseURL, storageState: ANON });
    expect((await api.get("/grades", { maxRedirects: 0 })).status()).toBe(307);
    const forged = await api.get("/grades", {
      headers: { cookie: `${SESSION}=${randomBytes(32).toString("base64url")}` },
    });
    expect(await forged.text()).toContain("NEXT_REDIRECT;replace;/login");
    await api.dispose();
    await ctx.close();
  });

  test("после выхода старый токен не работает", async ({ browser, page, context, baseURL }) => {
    await loginAs(page, "timur");
    const token = (await context.cookies()).find((c) => c.name === SESSION)!.value;
    await page.goto("/more");
    await page.getByRole("main").getByRole("button", { name: "Выйти", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);

    // Тот же токен в другом браузере (как если бы его украли до выхода) — уже ничего не открывает
    const ctx = await browser.newContext({ storageState: ANON });
    await putSessionCookie(ctx, baseURL!, token);
    const stolen = await ctx.newPage();
    await stolen.goto("/");
    await expect(stolen).toHaveURL(/\/login$/);
    await ctx.close();
  });

  test("«выйти на всех устройствах» закрывает и другие сессии", async ({ browser }) => {
    // Вера: её сессии не используют другие тесты
    const a = await freshPage(browser);
    const b = await freshPage(browser);
    await loginAs(a, "vera");
    await loginAs(b, "vera");
    await a.goto("/more");
    await a.getByRole("button", { name: "Выйти на всех устройствах" }).click();
    await expect(a).toHaveURL(/\/login$/);
    await b.goto("/grades");
    await expect(b).toHaveURL(/\/login$/);
  });

  test("вошедший на /login — сразу в свой кабинет", async ({ page }) => {
    await loginAs(page, "timur");
    await page.goto("/login");
    await expect(page).toHaveURL(/\/$/);
  });

  test.describe("сотрудник", () => {
    test.use({ storageState: STORAGE.irina });
    test("на страницах студента — отправляется в свой кабинет", async ({ page }) => {
      for (const route of ["/", "/grades", "/requests"]) {
        await page.goto(route);
        await expect(page).toHaveURL(/\/staff$/);
      }
    });
  });

  test.describe("демо-режим (DEMO_MODE=1 в e2e)", () => {
    test("кнопки «Войти как…» и 6 сценариев видны на /login", async ({ page }) => {
      await page.goto("/login");
      await expect(page.getByRole("heading", { name: "Демо-режим" })).toBeVisible();
      for (const name of ["Алиса", "Тимур", "Вера", "Ирина"]) {
        await expect(page.getByRole("button", { name: `Войти как ${name}` })).toBeVisible();
      }
      await expect(page.getByRole("heading", { name: "6 сценариев для проверки" })).toBeVisible();
      await expect(page.locator("ol > li")).toHaveCount(6);
    });

    test("«Войти как Ирина» → кабинет сотрудника, «Войти как Тимур» → «Сейчас»", async ({
      browser,
    }) => {
      const staff = await freshPage(browser);
      await staff.goto("/login");
      await staff.getByRole("button", { name: "Войти как Ирина" }).click();
      await expect(staff).toHaveURL(/\/staff$/);

      const student = await freshPage(browser);
      await student.goto("/login");
      await student.getByRole("button", { name: "Войти как Тимур" }).click();
      await expect(student).toHaveURL(/\/$/);
      await expect(
        student.getByRole("heading", {
          level: 1,
          name: /^(Доброе утро|Добрый день|Добрый вечер|Доброй ночи), /,
        }),
      ).toBeVisible();
    });

    test("подменённый логин в демо-форме не пускает", async ({ page }) => {
      await page.goto("/login");
      // Злоумышленник правит скрытое поле на фонового студента — сервер сверяет со списком
      await page
        .locator('input[type="hidden"][name="login"]')
        .first()
        .evaluate((el) => {
          (el as HTMLInputElement).value = "student.savelev";
        });
      await page.getByRole("button", { name: "Войти как Алиса" }).click();
      await expect(page).toHaveURL(/\/login$/);
      expect((await page.context().cookies()).find((c) => c.name === SESSION)).toBeUndefined();
    });
  });

  // ── Правки ux-reviewer T03: клавиатура и крупный текст на экране входа ──
  test("поле получает видимое кольцо фокуса с клавиатуры", async ({ page }) => {
    await page.goto("/login");
    await page.keyboard.press("Tab"); // «Перейти к содержимому»
    await page.keyboard.press("Tab");
    const login = page.getByLabel("Логин");
    await expect(login).toBeFocused();
    const outline = await login.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) };
    });
    expect(outline.style).not.toBe("none");
    expect(outline.width).toBeGreaterThanOrEqual(2);
  });

  test("после ответа формы фокус там, где исправлять, а не на <body>", async ({ browser }) => {
    const page = await freshPage(browser, randomIpHeaders());
    await page.goto("/login");
    await page.getByRole("button", { name: "Войти", exact: true }).click();
    await expect(page.getByLabel("Логин")).toBeFocused();

    await fillLogin(page, "student.savelev", "wrong-password");
    await expect(page.getByLabel("Пароль", { exact: true })).toBeFocused();
  });

  test("ошибка поля гаснет, когда его начали править", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Войти", exact: true }).click();
    await expect(page.getByText("Введите логин")).toBeVisible();
    await page.getByLabel("Логин").pressSequentially("st");
    await expect(page.getByText("Введите логин")).toHaveCount(0);
    await expect(page.getByText("Введите пароль")).toBeVisible();
  });

  test("/login при тексте 200% — без скролла вбок", async ({ page }) => {
    await page.goto("/login");
    await setTextScale(page, "200%");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("вход и выход на 360px", async ({ page, isMobile }) => {
    test.skip(!isMobile, "проект mobile-360");
    await loginAs(page, "timur");
    await page.getByRole("link", { name: "Ещё" }).click();
    await page.getByRole("main").getByRole("button", { name: "Выйти", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("заголовки и CSP (S6)", () => {
  test("заголовки безопасности и nonce в CSP", async ({ request }) => {
    const res = await request.get("/login");
    const h = res.headers();
    expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/);
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).not.toContain("unsafe-inline");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("nonce каждый раз новый", async ({ request }) => {
    const nonce = async () =>
      /'nonce-([^']+)'/.exec(
        (await request.get("/login")).headers()["content-security-policy"]!,
      )?.[1];
    expect(await nonce()).not.toBe(await nonce());
  });

  const pagesFor: [string, string, string | undefined][] = [
    ["/login", "аноним", undefined],
    ["/", "Алиса", STORAGE.alisa],
    ["/more", "Алиса", STORAGE.alisa],
    ["/staff", "Ирина", STORAGE.irina],
    ["/no-such-page", "Алиса", STORAGE.alisa],
    // T10: публичная проверка справки и мастер справок (плитки целей, шаг языка)
    [`/verify/${"A".repeat(22)}`, "аноним", undefined],
    ["/requests/new", "Алиса", STORAGE.alisa],
    ["/requests/new?purpose=visa&type=embassy", "Алиса", STORAGE.alisa],
  ];
  for (const [route, who, storage] of pagesFor) {
    test(`${route} (${who}): в консоли нет нарушений CSP`, async ({ browser }) => {
      const ctx = await browser.newContext({ storageState: storage ?? ANON });
      const page = await ctx.newPage();
      const violations: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error" && /Content Security Policy/i.test(m.text())) {
          violations.push(m.text().slice(0, 200));
        }
      });
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      expect(violations).toEqual([]);
      await ctx.close();
    });
  }
});

// Логины из helpers совпадают с сидом — иначе тесты молча проверяли бы не тех
test("логины тестовых аккаунтов e2e совпадают с демо-списком", async () => {
  const { DEMO_LOGINS } = await import("../../src/lib/demo-accounts");
  expect(
    Object.values(ACCOUNTS)
      .map((a) => a.login)
      .sort(),
  ).toEqual([...DEMO_LOGINS].sort());
});
