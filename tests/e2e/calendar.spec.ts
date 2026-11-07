// Календарь (T11): подписка .ics по токену (S7) и профиль. Алиса — сессия по умолчанию; .ics читает
// аноним (так его читают Google и iPhone). Перевыпуск — на временном студенте: токен Алисы — часть демо.
// Изоляция с положительным контролем: пары Алисы в её подписке есть, пар группы Тимура — нет, и наоборот.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Browser } from "@playwright/test";
import { ANON } from "./helpers/auth";
import { withDb } from "./helpers/db";
import { tempStudent } from "./helpers/temp-student";

type Who = { token: string; lastName: string; recordBookNo: string; group: string };

async function studentRow(studentId: string): Promise<Who> {
  const row = await withDb(
    async (c) =>
      (
        await c.query<Who>(
          `SELECT s."calendarToken" AS token, s."lastName" AS "lastName", s."recordBookNo" AS "recordBookNo",
                  g.name AS "group"
             FROM "Student" s JOIN "Group" g ON g.id = s."groupId" WHERE s.id = $1`,
          [studentId],
        )
      ).rows[0],
  );
  expect(row, `${studentId} есть в сиде`).toBeDefined();
  return row!;
}

/** Ближайшая (в окне подписки) пара только основной группы студента — её UID должен быть только у него. */
async function groupLessonId(studentId: string): Promise<string> {
  const row = await withDb(
    async (c) =>
      (
        await c.query<{ id: string }>(
          `SELECT l.id FROM "Lesson" l JOIN "Student" s ON s."groupId" = l."groupId"
            WHERE s.id = $1 AND l."startsAt" > now() - interval '13 days'
              AND l."startsAt" < now() + interval '80 days'
            ORDER BY l."startsAt" LIMIT 1`,
          [studentId],
        )
      ).rows[0],
  );
  expect(row, `у ${studentId} есть пары в окне подписки`).toBeDefined();
  return row!.id;
}

async function anon(browser: Browser): Promise<APIRequestContext> {
  return (await browser.newContext({ storageState: ANON })).request;
}

const feed = (token: string) => `/api/calendar/${token}.ics`;
const unfold = (ics: string) => ics.replace(/\r\n /g, "");

test.describe("подписка .ics", () => {
  test("аноним получает пары по токену; о студенте — ничего; чужих пар нет", async ({
    browser,
  }) => {
    const api = await anon(browser);
    const alisa = await studentRow("stu-alisa");
    const timur = await studentRow("stu-timur");
    const [alisaLesson, timurLesson] = await Promise.all([
      groupLessonId("stu-alisa"),
      groupLessonId("stu-timur"),
    ]);

    const res = await api.get(feed(alisa.token));
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/calendar");
    expect(res.headers()["cache-control"]).toContain("no-store");
    const ics = unfold(await res.text());
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    // Положительный контроль: своя пара — есть
    expect(ics).toContain(`UID:${alisaLesson}@protokol`);
    // Изоляция и S7: пары группы Тимура нет; ни фамилии, ни зачётки, ни группы, ни оценок
    expect(ics).not.toContain(`UID:${timurLesson}@protokol`);
    for (const secret of [alisa.lastName, alisa.recordBookNo, alisa.group]) {
      expect(ics).not.toContain(secret);
    }
    expect(ics).not.toMatch(/рейтинг|оценк|зачётк/i);

    // И наоборот: у Тимура — его пара, без пары Алисы
    const timurIcs = unfold(await (await api.get(feed(timur.token))).text());
    expect(timurIcs).toContain(`UID:${timurLesson}@protokol`);
    expect(timurIcs).not.toContain(`UID:${alisaLesson}@protokol`);
  });

  test("битый и неизвестный токен — 404 без тела", async ({ browser }) => {
    const api = await anon(browser);
    for (const path of [
      feed("A".repeat(43).replace(/A$/, "B")),
      feed("short"),
      "/api/calendar/..%2F..%2Fetc.ics",
      `/api/calendar/${"A".repeat(44)}.ics`,
    ]) {
      const res = await api.get(path);
      expect(res.status(), path).toBe(404);
      expect(await res.text(), path).toBe("");
    }
  });
});

test.describe("профиль", () => {
  test("свои данные и своя ссылка на подписку", async ({ page }) => {
    const alisa = await studentRow("stu-alisa");
    await page.goto("/profile");
    await expect(page.getByRole("heading", { level: 1, name: "Профиль" })).toBeVisible();
    await expect(page.getByText(alisa.lastName, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(`группа ${alisa.group}`)).toBeVisible();
    await expect(page.getByTestId("calendar-url")).toHaveText(new RegExp(`${alisa.token}\\.ics$`));
    const google = page.getByRole("link", { name: "Добавить в Google Календарь" });
    expect(new URL((await google.getAttribute("href"))!).searchParams.get("cid")).toMatch(
      new RegExp(`^webcal://.+/api/calendar/${alisa.token}\\.ics$`),
    );
    await expect(page.getByRole("link", { name: "Добавить в Apple Календарь" })).toHaveAttribute(
      "href",
      new RegExp(`^webcal://.+${alisa.token}\\.ics$`),
    );
    // Номера зачётки на странице нет
    expect(await page.content()).not.toContain(alisa.recordBookNo);

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(
      violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id),
    ).toEqual([]);
  });

  test("перевыпуск ломает старую ссылку, новая работает", async ({ browser, baseURL }) => {
    const s = await tempStudent(browser, baseURL!);
    try {
      const { page } = s;
      const api = await anon(browser);
      await page.goto("/profile");
      const code = page.getByTestId("calendar-url");
      const oldUrl = (await code.textContent())!;
      const oldPath = new URL(oldUrl).pathname;
      expect((await api.get(oldPath)).status()).toBe(200);

      await page.getByRole("button", { name: "Перевыпустить ссылку" }).click();
      const dialog = page.getByRole("dialog", { name: "Перевыпустить ссылку?" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Перевыпустить" }).click();
      await expect(dialog).toBeHidden();
      await expect(code).not.toHaveText(oldUrl);

      const newPath = new URL((await code.textContent())!).pathname;
      expect(newPath).not.toBe(oldPath);
      expect((await api.get(oldPath)).status()).toBe(404);
      const fresh = await api.get(newPath);
      expect(fresh.status()).toBe(200);
      expect(await fresh.text()).toContain("BEGIN:VCALENDAR");
    } finally {
      await s.remove();
    }
  });
});

test.describe("профиль: 360px и крупный текст", () => {
  for (const scale of ["100%", "200%"]) {
    test(`/profile при тексте ${scale} — без скролла вбок`, async ({ page }) => {
      await page.goto("/profile");
      await expect(page.getByRole("heading", { level: 1, name: "Профиль" })).toBeVisible();
      await page.evaluate((s) => {
        document.documentElement.style.fontSize = s;
      }, scale);
      // Длинные подписи кнопок («Добавить в Google Календарь») переносятся, а не растягивают экран
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0);
    });
  }
});

test("перевыпуск: после подтверждения — сообщение об успехе на месте", async ({
  browser,
  baseURL,
}) => {
  const s = await tempStudent(browser, baseURL!);
  try {
    await s.page.goto("/profile");
    await s.page.getByRole("button", { name: "Перевыпустить ссылку" }).click();
    await s.page
      .getByRole("dialog", { name: "Перевыпустить ссылку?" })
      .getByRole("button", { name: "Перевыпустить" })
      .click();
    await expect(
      s.page.getByRole("status").filter({ hasText: "Ссылка перевыпущена" }),
    ).toBeVisible();
  } finally {
    await s.remove();
  }
});
