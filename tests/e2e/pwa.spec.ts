// PWA (T11): манифест и воркер отдаются без входа; расписание на две недели открывается без сети после
// первого визита (приёмка «режим самолёта»); прочие страницы без сети — «Нет сети»; выход стирает кэш.
// Воркер включён только здесь (в остальных spec — serviceWorkers: "block", playwright.config.ts).
// Выход проверяем на временном студенте: выход Алисы удалил бы общую сессию соседних тестов.
import { expect, test, type Page } from "@playwright/test";
import { ANON } from "./helpers/auth";
import { withDb } from "./helpers/db";
import { tempStudent } from "./helpers/temp-student";

test.use({ serviceWorkers: "allow" });

/** Адреса из кэша страниц воркера: «/schedule?week=…». */
async function cachedPages(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const cache = await caches.open("protokol-pages");
    return (await cache.keys()).map((r) => {
      const u = new URL(r.url);
      return u.pathname + u.search;
    });
  });
}

/** Дождаться воркера и докачки двух недель (17 адресов: сегодня, 14 дней, 2 недели). */
async function waitForOfflineCopy(page: Page, min = 17) {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect
    .poll(async () => (await cachedPages(page)).length, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(min);
}

test("манифест, воркер, значки и офлайн-страница — без входа", async ({ browser }) => {
  const api = (await browser.newContext({ storageState: ANON })).request;
  const manifest = await api.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  const json = await manifest.json();
  expect(json.short_name).toBe("Протокол");
  expect(json.display).toBe("standalone");
  expect(json.icons.map((i: { purpose: string }) => i.purpose)).toContain("maskable");

  const sw = await api.get("/sw.js");
  expect(sw.status()).toBe(200);
  expect(sw.headers()["content-type"]).toContain("javascript");
  expect(sw.headers()["cache-control"]).toContain("no-cache");

  for (const path of ["/icons/icon-192.png", "/icons/maskable-512.png", "/apple-icon.png"]) {
    const res = await api.get(path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()["content-type"], path).toContain("image/png");
  }
  expect((await api.get("/offline.html")).status()).toBe(200);
});

test("CSP разрешает воркер и манифест", async ({ page }) => {
  const res = await page.goto("/schedule");
  const csp = res!.headers()["content-security-policy"];
  expect(csp).toContain("worker-src 'self'");
  expect(csp).toContain("manifest-src 'self'");
});

test("расписание открывается без сети после первого визита", async ({ page, context }) => {
  await page.goto("/schedule");
  await waitForOfflineCopy(page);
  const weeks = (await cachedPages(page)).filter((p) => p.startsWith("/schedule?week=")).sort();
  expect(weeks).toHaveLength(2);
  const nextWeek = weeks[1]!;

  // Пара Алисы на следующей неделе (её саму онлайн мы не открывали — её докачал воркер)
  const discipline = await withDb(
    async (c) =>
      (
        await c.query<{ name: string }>(
          `SELECT d.name FROM "Lesson" l
             JOIN "Discipline" d ON d.id = l."disciplineId"
             JOIN "Student" s ON s."groupId" = l."groupId"
            WHERE s.id = 'stu-alisa'
              AND l."startsAt" >= date_trunc('week', now() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow' + interval '7 days'
              AND l."startsAt" <  date_trunc('week', now() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow' + interval '14 days'
            ORDER BY l."startsAt" LIMIT 1`,
        )
      ).rows[0]?.name,
  );
  expect(discipline, "у Алисы есть пары на следующей неделе").toBeTruthy();

  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Расписание" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Нет сети" })).toContainText(
      "показываем сохранённое расписание",
    );

    await page.goto(nextWeek);
    await expect(page.getByRole("heading", { level: 1, name: "Расписание" })).toBeVisible();
    await expect(page.getByRole("main")).toContainText(discipline!);

    // Другие разделы без сети — честная страница «Нет сети» со ссылкой на расписание
    await page.goto("/grades");
    await expect(page.getByRole("heading", { level: 1, name: "Нет сети" })).toBeVisible();
    // Стили и значок тоже из кэша воркера (ux-reviewer T11: страница была чёрным Times с битой картинкой)
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(
      "rgba(0, 0, 0, 0)",
    );
    expect(
      await page.evaluate(() => document.querySelector("img")?.naturalWidth ?? 0),
    ).toBeGreaterThan(0);
    await page.getByRole("link", { name: "Открыть расписание" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Расписание" })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test("выход стирает сохранённое расписание", async ({ browser, baseURL }) => {
  const s = await tempStudent(browser, baseURL!);
  try {
    const { page, context } = s;
    await page.goto("/schedule");
    await waitForOfflineCopy(page, 1);

    await page.goto("/more");
    await page.getByRole("main").getByRole("button", { name: "Выйти", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect.poll(() => cachedPages(page)).toEqual([]);

    await context.setOffline(true);
    try {
      await page.goto("/schedule");
      await expect(page.getByRole("heading", { level: 1, name: "Нет сети" })).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  } finally {
    await s.remove();
  }
});
