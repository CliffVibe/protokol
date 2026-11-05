// Обязательные тесты безопасности из docs/05-security.md (8 штук) + проверки входа и сессий T03.
// Те, что пока нельзя проверить, — test.fixme с номером задачи, где появится нужный маршрут.
// Секреты: значения берутся из окружения и НИКОГДА не попадают в сообщения об ошибке — только имя переменной.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import { STORAGE } from "../../playwright.config";
import { ACCOUNTS, ANON, fillLogin, loginAs, randomIpHeaders } from "./helpers/auth";

const SESSION = "__Host-session";

/** Новая анонимная вкладка — чтобы не трогать общие сессии Алисы и Ирины из setup. */
async function freshPage(browser: Browser, headers?: Record<string, string>): Promise<Page> {
  const ctx = await browser.newContext({ storageState: ANON, extraHTTPHeaders: headers });
  return ctx.newPage();
}

test.describe("05-security: обязательные тесты", () => {
  test.fixme("1. Студент Б открывает /requests/<номер заявки А> → 404 (T08: маршрут /requests/[number])", async () => {
    // T08: номер заявки А брать через её же сессию (список /requests под Алисой), а не из сида,
    // затем под Тимуром открыть /requests/<номер> → статус 404 и нет данных заявки в HTML.
  });

  test.fixme("2. Студент Б вызывает Server Action отмены заявки А → ошибка, заявка не изменилась (T08)", async () => {
    // T08: под Тимуром отправить action отмены с номером заявки Алисы; затем под Алисой —
    // статус прежний.
  });

  test("3. Студент открывает /staff → не видит кабинет сотрудника", async ({ page }) => {
    const res = await page.goto("/staff");
    expect(res?.status()).toBeLessThan(500);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("navigation", { name: "Разделы кабинета" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Очередь заявок" })).toHaveCount(0);
  });

  test.describe("4. Неавторизованный", () => {
    test.use({ storageState: ANON });
    for (const route of ["/", "/grades", "/staff", "/requests", "/profile"]) {
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
    for (const route of ["/", "/grades", "/more", "/profile"]) {
      await page.goto(route);
      pages.push(await page.content());
    }

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
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      const { rows } = await client.query<{ total: string; bad: string }>(
        `SELECT count(*) AS total,
                count(*) FILTER (WHERE "passwordHash" NOT LIKE '$argon2id$%') AS bad
           FROM "User"`,
      );
      expect(Number(rows[0]!.total)).toBeGreaterThan(0);
      expect(Number(rows[0]!.bad)).toBe(0);
    } finally {
      await client.end();
    }
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

  test.fixme("8. /verify/<token> не содержит номера зачётки и оценок (T10: страница проверки справки)", async () => {
    // T10: открыть /verify/<qrToken выданной справки Алисы> анонимно; в HTML нет recordBookNo
    // и оценок, есть только «действительна», тип, дата выдачи и инициалы.
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
      await expect(student.getByRole("heading", { level: 1, name: "Сейчас" })).toBeVisible();
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
