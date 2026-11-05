// Оболочки студента и сотрудника (T04): навигация, клавиатура, цели касания, тема, доступность.
// Проекты desktop (1280) и mobile-360 гоняют одни и те же тесты; различия — через isMobile.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const NOTICE =
  "Концепт для конкурса. Не является официальным сервисом МГИМО. Все данные вымышлены.";

const STUDENT_ROUTES = [
  "/",
  "/schedule",
  "/grades",
  "/requests",
  "/more",
  "/notifications",
  "/profile",
  "/assistant",
];
const ALL_ROUTES = [...STUDENT_ROUTES, "/staff"];

const BOTTOM = [
  ["Сейчас", "/"],
  ["Расписание", "/schedule"],
  ["Учёба", "/grades"],
  ["Заявки", "/requests"],
  ["Ещё", "/more"],
] as const;

const SIDE = [
  ...BOTTOM.slice(0, 4),
  ["Уведомления", "/notifications"],
  ["Профиль", "/profile"],
  ["Помощник", "/assistant"],
] as const;

function mainNav(page: Page) {
  return page.getByRole("navigation", { name: "Основная навигация" });
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`);
}

test.describe("каждый раздел", () => {
  for (const route of ALL_ROUTES) {
    test(`${route}: плашка концепта, h1, без скролла вбок`, async ({ page }) => {
      const res = await page.goto(route);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("note")).toHaveText(NOTICE);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    });

    for (const scheme of ["light", "dark"] as const) {
      test(`${route}: axe без serious/critical, тема ${scheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(route);
        expect(await seriousViolations(page)).toEqual([]);
      });
    }
  }
});

test.describe("навигация студента", () => {
  test("на мобильном — нижняя панель, на десктопе — боковая", async ({ page, isMobile }) => {
    await page.goto("/");
    const nav = mainNav(page);
    await expect(nav).toHaveCount(1); // вторая скрыта display:none и не видна скринридеру
    const labels = (isMobile ? BOTTOM : SIDE).map(([label]) => label);
    await expect(nav.getByRole("link")).toHaveText(labels);
  });

  test("переход по каждому пункту и aria-current", async ({ page, isMobile }) => {
    await page.goto("/");
    for (const [label, href] of isMobile ? BOTTOM : SIDE) {
      await mainNav(page).getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(href);
      await expect(mainNav(page).getByRole("link", { name: label, exact: true })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(mainNav(page).locator('[aria-current="page"]')).toHaveCount(1);
    }
  });

  test("«Ещё» подсвечена и на своих подразделах (мобильный)", async ({ page, isMobile }) => {
    test.skip(!isMobile, "только нижняя панель");
    await page.goto("/more");
    await page
      .getByRole("navigation", { name: "Другие разделы" })
      .getByRole("link", { name: "Профиль" })
      .click();
    await expect(page).toHaveURL("/profile");
    await expect(mainNav(page).getByRole("link", { name: "Ещё" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("цели касания ≥ 44×44", async ({ page }) => {
    for (const route of ["/", "/more", "/staff"]) {
      await page.goto(route);
      const targets = page.locator("a:visible, button:visible, label:has(input):visible");
      const boxes = await targets.evaluateAll((els) =>
        // .sr-only (skip-ссылка до фокуса) — не цель касания: её не видно и в неё не попасть пальцем
        els
          .filter((el) => !el.matches(".sr-only"))
          .map((el) => {
            const r = el.getBoundingClientRect();
            return {
              text: (el.textContent ?? "").trim() || el.getAttribute("title"),
              w: r.width,
              h: r.height,
            };
          }),
      );
      expect(boxes.length).toBeGreaterThan(0);
      for (const b of boxes) {
        expect(b.h, `${route}: «${b.text}» высота`).toBeGreaterThanOrEqual(44);
        expect(b.w, `${route}: «${b.text}» ширина`).toBeGreaterThanOrEqual(44);
      }
    }
  });
});

test.describe("клавиатура", () => {
  test("первый Tab — «Перейти к содержимому», Enter переводит фокус в main", async ({ page }) => {
    await page.goto("/schedule");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Перейти к содержимому" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeFocused();
  });

  test("до пунктов навигации можно дойти Tab и открыть Enter", async ({ page }) => {
    await page.goto("/");
    let reached = false;
    for (let i = 0; i < 40 && !reached; i++) {
      await page.keyboard.press("Tab");
      reached = await page.evaluate(
        () =>
          document.activeElement?.closest('nav[aria-label="Основная навигация"]') !== null &&
          document.activeElement?.textContent?.includes("Заявки") === true,
      );
    }
    expect(reached, "Tab не дошёл до «Заявки»").toBe(true);
    // Фокус виден: outline не none
    const outline = await page.evaluate(
      () => getComputedStyle(document.activeElement!).outlineStyle,
    );
    expect(outline).not.toBe("none");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/requests");
  });

  test("переключатель темы — стрелками", async ({ page }) => {
    await page.goto("/more");
    const light = page.locator("main").getByRole("radio", { name: "Светлая" });
    await light.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("main").getByRole("radio", { name: "Тёмная" })).toBeChecked();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  });
});

test.describe("тема", () => {
  test("выбор сохраняется в cookie и переживает перезагрузку", async ({ page, context }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/more");
    await page.locator("main").getByText("Тёмная", { exact: true }).click();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    const cookie = (await context.cookies()).find((c) => c.name === "theme");
    expect(cookie?.value).toBe("dark");
    await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute(
      "content",
      "#0A0D17",
    );

    await page.reload();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await expect(page.locator("main").getByRole("radio", { name: "Тёмная" })).toBeChecked();

    await page.locator("main").getByText("Системная", { exact: true }).click();
    await expect(page.locator("html")).not.toHaveClass(/\b(dark|light)\b/);
    expect((await context.cookies()).find((c) => c.name === "theme")).toBeUndefined();
  });

  test("без мигания: класс темы и theme-color уже в HTML с сервера", async ({ request }) => {
    const dark = await (await request.get("/", { headers: { cookie: "theme=dark" } })).text();
    expect(dark).toMatch(/<html[^>]*class="[^"]*\bdark\b/);
    expect(dark).toMatch(/<meta name="theme-color" content="#0A0D17"/);

    const system = await (await request.get("/")).text();
    expect(system).not.toMatch(/<html[^>]*class="[^"]*\b(dark|light)\b/);
    expect(system).toContain('media="(prefers-color-scheme: dark)"');

    const junk = await (
      await request.get("/", { headers: { cookie: "theme=%3Cscript%3E" } })
    ).text();
    expect(junk).not.toMatch(/<html[^>]*(script|%3C)/i);
    expect(junk).not.toMatch(/<html[^>]*class="[^"]*\b(dark|light)\b/);
  });
});

test.describe("служебные страницы", () => {
  test("/dev/ui в прод-сборке — 404", async ({ page }) => {
    const res = await page.goto("/dev/ui");
    expect(res?.status()).toBe(404);
  });

  test("несуществующий адрес — человеческая 404 с плашкой", async ({ page }) => {
    const res = await page.goto("/no-such-page");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Такой страницы нет" })).toBeVisible();
    await expect(page.getByRole("note")).toHaveText(NOTICE);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });

  test("кабинет сотрудника рендерится в своей оболочке", async ({ page }) => {
    await page.goto("/staff");
    await expect(page.getByRole("heading", { level: 1, name: "Очередь заявок" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Разделы кабинета" })).toBeVisible();
    await expect(mainNav(page)).toHaveCount(0);
  });
});

test.describe("крупный текст (200%)", () => {
  test("все пункты нижней панели и «Ещё» остаются на экране", async ({ page, isMobile }) => {
    test.skip(!isMobile, "нижняя панель — только на мобильном");
    await page.goto("/more");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    const width = page.viewportSize()!.width;
    const navLinks = mainNav(page).getByRole("link");
    await expect(navLinks).toHaveCount(5);
    for (const link of await navLinks.all()) {
      const box = (await link.boundingBox())!;
      expect(box.x, await link.innerText()).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, await link.innerText()).toBeLessThanOrEqual(width);
    }
    const moreLinks = page.getByRole("navigation", { name: "Другие разделы" }).getByRole("link");
    for (const link of await moreLinks.all()) {
      const fits = await link.evaluate((el) =>
        [...el.querySelectorAll("span, svg")].every(
          (child) => child.getBoundingClientRect().right <= el.getBoundingClientRect().right + 0.5,
        ),
      );
      expect(fits, await link.innerText()).toBe(true);
    }
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe("шкала типографики в браузере", () => {
  test("подписи нижней панели 12px, кнопка «Повторить» и плашка — по шкале", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "нижняя панель — только на мобильном");
    await page.goto("/schedule");
    const sizes = await mainNav(page)
      .getByRole("link")
      .evaluateAll((links) =>
        links.map((a) => getComputedStyle(a.querySelector("span:last-child")!).fontSize),
      );
    expect(sizes).toEqual(Array(5).fill("12px"));
    expect(await page.getByRole("note").evaluate((el) => getComputedStyle(el).fontSize)).toBe(
      "14px",
    );
  });
});

test.describe("текст 200% без горизонтального скролла", () => {
  for (const route of ["/", "/requests", "/staff", "/more", "/no-such-page"]) {
    test(`${route}`, async ({ page }) => {
      await page.goto(route);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    });
  }
});
