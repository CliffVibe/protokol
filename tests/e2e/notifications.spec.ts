// Уведомления студента (T09): колокольчик в шапке телефона за 1 касание, бейдж = числу новых, вкладки,
// «открыть» отмечает прочитанным, «Отметить всё прочитанным», изоляция (студент B не видит и не
// отмечает уведомления A). Каждый тест — со своим временным студентом (helpers/temp-student.ts):
// счётчики не делим ни с демо, ни с параллельными проектами и повторами.
import { expect, test } from "@playwright/test";
import { tempStudent, type TempStudent } from "./helpers/temp-student";
import { withDb } from "./helpers/db";

let s: TempStudent;
test.beforeEach(async ({ browser, baseURL }) => {
  s = await tempStudent(browser, baseURL!);
});
test.afterEach(async () => {
  await s?.remove();
});

const readAt = (id: string) =>
  withDb(async (c) => {
    const r = await c.query<{ readAt: Date | null }>(
      `SELECT "readAt" FROM "Notification" WHERE id = $1`,
      [id],
    );
    return r.rows[0]?.readAt ?? null;
  });

test("колокольчик в шапке: уведомления за 1 касание, бейдж — число новых", async ({ isMobile }) => {
  test.skip(
    !isMobile,
    "колокольчик — только в мобильной шапке; на десктопе — пункт в боковой панели",
  );
  await s.notify({ kind: "SCHEDULE_CHANGE", title: "Перенос пары: Право", link: "/schedule" });
  await s.notify({ kind: "ANNOUNCEMENT", title: "Объявление для проверки" });
  await s.notify({ kind: "REQUEST_STATUS", title: "Старое", read: true });
  const { page } = s;

  await page.goto("/");
  const bell = page.getByRole("link", { name: "Уведомления, 2 непрочитанных" });
  await expect(bell).toBeVisible();
  // На «Ещё» числа нет (решение человека 06.11): одно число на экране
  await expect(page.getByRole("link", { name: "Ещё", exact: true })).toBeVisible();

  await bell.click();
  await expect(page).toHaveURL("/notifications");
  await expect(page.getByRole("link", { name: /^Уведомления/ }).first()).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Уведомления");
});

test("открыть уведомление — переход по ссылке и «прочитано»; «Отметить всё прочитанным»", async ({
  isMobile,
}) => {
  const moved = await s.notify({
    kind: "SCHEDULE_CHANGE",
    title: "Перенос пары: Право",
    link: "/schedule",
  });
  const other = await s.notify({ kind: "DEADLINE", title: "Через 2 дня — эссе" });
  const { page } = s;
  const count = () =>
    isMobile
      ? page.locator("[data-header-bell]").getAttribute("aria-label")
      : page
          .getByRole("navigation", { name: "Основная навигация" })
          .getByRole("link", { name: /^Уведомления/ })
          .textContent();

  await page.goto("/notifications");
  await expect(page.getByText("2 новых")).toBeVisible();
  const row = page.locator(`[data-notification="${moved}"]`);
  await expect(row.getByRole("button")).toHaveText(/Новое:.*Перенос пары: Право/);
  await row.getByRole("button").click();
  await expect(page).toHaveURL("/schedule");
  await expect.poll(() => readAt(moved)).not.toBeNull();
  expect(await readAt(other)).toBeNull();
  await expect.poll(count).toMatch(/1 непрочитанное/);

  await page.goto("/notifications");
  await page.getByRole("button", { name: "Отметить всё прочитанным" }).click();
  await expect(page.getByText("Новых нет — вы всё прочитали.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Отметить всё прочитанным" })).toHaveCount(0);
  expect(await readAt(other)).not.toBeNull();
  await expect.poll(count).not.toMatch(/непрочитан/);
});

test("вкладки фильтруют по виду; битая вкладка — «Все»", async () => {
  await s.notify({ kind: "REQUEST_STATUS", title: "Заявка принята — проверка вкладок" });
  await s.notify({ kind: "SCHEDULE_CHANGE", title: "Перенос — проверка вкладок" });
  const { page } = s;
  const tabs = page.getByRole("navigation", { name: "Виды уведомлений" });

  await page.goto("/notifications");
  await expect(tabs.getByRole("link")).toHaveText([
    /^Все/,
    "Объявления",
    "Дедлайны",
    /^Заявки/,
    /^Расписание/,
  ]);
  await tabs.getByRole("link", { name: /^Заявки/ }).click();
  await expect(page).toHaveURL("/notifications?tab=requests");
  await expect(tabs.getByRole("link", { name: /^Заявки/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Заявка принята — проверка вкладок")).toBeVisible();
  await expect(page.getByText("Перенос — проверка вкладок")).toHaveCount(0);

  await tabs.getByRole("link", { name: "Дедлайны" }).click();
  await expect(page.getByRole("heading", { name: "Напоминаний о сроках нет" })).toBeVisible();

  const res = await page.goto("/notifications?tab=../../etc");
  expect(res?.status()).toBe(200);
  await expect(tabs.getByRole("link", { name: /^Все/ })).toHaveAttribute("aria-current", "page");
});

test("изоляция: Алиса не видит уведомление студента B и не может отметить его прочитанным", async ({
  page,
}) => {
  const secret = `Только для B — ${Math.random().toString(36).slice(2, 8)}`;
  const id = await s.notify({ kind: "REQUEST_STATUS", title: secret });

  // Положительный контроль: B своё видит
  await s.page.goto("/notifications");
  await expect(s.page.getByText(secret)).toBeVisible();

  // Алиса (сессия по умолчанию): в списке его нет
  await page.goto("/notifications");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Уведомления");
  await expect(page.getByText(secret)).toHaveCount(0);

  // Подменяем id в форме своей строки на id уведомления B и отправляем — Server Action проверит владельца
  const form = page.locator("[data-notification] form").first();
  await expect(form).toHaveCount(1);
  await form
    .locator('input[name="id"]')
    .evaluate((el, v) => ((el as HTMLInputElement).value = v), id);
  await form.getByRole("button").click();
  await expect(page).toHaveURL("/notifications");
  expect(await readAt(id)).toBeNull();
});

test("«Отметить прочитанными» на вкладке гасит только её вид (ux-reviewer T09)", async () => {
  const moved = await s.notify({ kind: "SCHEDULE_CHANGE", title: "Перенос — только эта вкладка" });
  const due = await s.notify({ kind: "DEADLINE", title: "Срок — другая вкладка" });
  const { page } = s;
  await page.goto("/notifications?tab=schedule");
  await page.getByRole("button", { name: "Отметить прочитанными" }).click();
  await expect(page.getByRole("button", { name: "Отметить прочитанными" })).toHaveCount(0);
  expect(await readAt(moved)).not.toBeNull();
  expect(await readAt(due)).toBeNull();
  await expect(page.getByText("1 новое")).toBeVisible();
});

test("доска объявлений: «Новое» у объявления с непрочитанным уведомлением, число на вкладке", async () => {
  // Объявление сида «для всех» (ann-1) видят и студенты МЖ — временный студент в группе Веры
  await s.notify({
    kind: "ANNOUNCEMENT",
    title: "Зимняя сессия: расписание экзаменов",
    link: "/notifications?tab=announcements#announcement-ann-1",
  });
  const { page } = s;
  await page.goto("/notifications?tab=announcements");
  const tabs = page.getByRole("navigation", { name: "Виды уведомлений" });
  await expect(tabs.getByRole("link", { name: /^Объявления/ })).toContainText("1");
  const item = page.locator("#announcement-ann-1");
  await expect(item).toContainText("Новое");
  await page.getByRole("button", { name: "Отметить прочитанными" }).click();
  await expect(page.locator("#announcement-ann-1")).not.toContainText("Новое");
  await expect(tabs.getByRole("link", { name: /^Объявления/ })).not.toContainText("1");
});
