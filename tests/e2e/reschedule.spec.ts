// Перенос пары сотрудником (T09, приёмка 2): Ирина переносит пару группы 2МО-3 — у Алисы уведомление
// и строка в «Изменениях» на «Сейчас» с «было …»; у Тимура (другая группа) уведомления нет.
// База общая с демо: пару тест «занимает» атомарно (параллельные проекты и повторы берут разные пары),
// а в конце возвращает к исходным полям и удаляет свои уведомления. Блокируем только строку пары
// (`FOR UPDATE OF l2`): без OF блокировалась бы и строка группы, и параллельный тест со SKIP LOCKED
// пропускал бы все пары 2МО-3.
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { STORAGE } from "../../playwright.config";
import { addDays, mskDateKey, mskStartOfDay } from "../../src/lib/msk";
import { withDb } from "./helpers/db";

type Claimed = {
  id: string;
  groupId: string;
  startsAt: Date;
  endsAt: Date;
  room: string;
  discipline: string;
};

/**
 * Ближайшая будущая пара без изменений у 2МО-3: метка в changeNote — пара занята этим тестом.
 * Не четверг: там schedule.spec проверяет переход в Одинцово — вечером в среду ближайшими были как раз
 * четверговые пары, перенос убирал переход, и параллельный тест падал (найдено в T14).
 */
async function claimLesson(marker: string): Promise<Claimed> {
  return withDb(async (c) => {
    const r = await c.query<Claimed>(
      `UPDATE "Lesson" l SET "changeNote" = $1
       FROM "Discipline" d
       WHERE l.id = (
         SELECT l2.id FROM "Lesson" l2 JOIN "Group" g ON g.id = l2."groupId"
         WHERE g.name = '2МО-3' AND l2.change = 'NONE' AND l2."changeNote" IS NULL
           AND l2."startsAt" > now() + interval '2 hours'
           AND EXTRACT(ISODOW FROM l2."startsAt" AT TIME ZONE 'Europe/Moscow') <> 4
         ORDER BY l2."startsAt" LIMIT 1 FOR UPDATE OF l2 SKIP LOCKED
       ) AND d.id = l."disciplineId"
       RETURNING l.id, l."groupId", l."startsAt", l."endsAt", l.room, d.name AS discipline`,
      [marker],
    );
    const row = r.rows[0];
    if (!row) throw new Error("Нет свободной будущей пары у 2МО-3 — нужен сид расписания");
    return row;
  });
}

async function restore(l: Claimed, marker: string) {
  await withDb(async (c) => {
    await c.query(
      `UPDATE "Lesson" SET "startsAt" = $2, "endsAt" = $3, room = $4, change = 'NONE',
         "changeNote" = NULL, "originalStartsAt" = NULL WHERE id = $1`,
      [l.id, l.startsAt, l.endsAt, l.room],
    );
    await c.query(`DELETE FROM "Notification" WHERE kind = 'SCHEDULE_CHANGE' AND body LIKE $1`, [
      `%${marker}%`,
    ]);
  });
}

const notifiedStudents = (marker: string) =>
  withDb(async (c) => {
    const r = await c.query<{ studentId: string }>(
      `SELECT "studentId" FROM "Notification" WHERE kind = 'SCHEDULE_CHANGE' AND body LIKE $1`,
      [`%${marker}%`],
    );
    return r.rows.map((x) => x.studentId);
  });

test("приёмка: перенос пары — у Алисы уведомление и «было …» на главной, у Тимура ничего", async ({
  page,
  browser,
}) => {
  const marker = `e2e-${randomUUID().slice(0, 8)}`;
  const reason = `Преподаватель на конференции ${marker}`;
  const l = await claimLesson(marker);
  try {
    // Завтра 20:00 — попадает в «Изменения» на «Сейчас» (сегодня и завтра)
    const tomorrow = addDays(mskStartOfDay(new Date()), 1);
    const irina = await (await browser.newContext({ storageState: STORAGE.irina })).newPage();
    await irina.goto(`/staff/schedule?group=${l.groupId}&day=${mskDateKey(l.startsAt)}`);
    const row = irina.locator(`[data-lesson="${l.id}"]`);
    await row.getByRole("button", { name: new RegExp(`^Перенести: ${l.discipline}`) }).click();
    const dialog = irina.getByRole("dialog");
    await dialog.getByLabel("Дата").fill(mskDateKey(tomorrow));
    await dialog.getByLabel("Начало").fill("20:00");
    await dialog.getByLabel("Причина").fill(reason);
    await dialog.getByRole("button", { name: "Перенести пару" }).click();
    await expect(dialog).toBeHidden();

    // Пара ушла на другой день — смотрим завтрашний: там «Перенос, было …» и причина
    await irina.goto(`/staff/schedule?group=${l.groupId}&day=${mskDateKey(tomorrow)}`);
    await expect(irina.locator(`[data-lesson="${l.id}"]`)).toContainText(/Перенос, было/);
    await expect(irina.locator(`[data-lesson="${l.id}"]`)).toContainText(reason);

    // Алиса: уведомление на вкладке «Расписание» и строка в «Изменениях» на «Сейчас»
    await page.goto("/notifications?tab=schedule");
    await expect(
      page.getByRole("listitem").filter({ hasText: reason }).getByRole("button"),
    ).toContainText(`Перенос пары: ${l.discipline}`);
    await page.goto("/");
    const changes = page.getByRole("region", { name: "Изменения", exact: true });
    await expect(changes.getByText(reason, { exact: false })).toBeVisible();
    await expect(changes.getByRole("listitem").filter({ hasText: reason })).toContainText(
      /[Бб]ыло/,
    );

    // В БД: уведомление у Алисы, у Тимура — нет
    const ids = await notifiedStudents(marker);
    expect(ids).toContain("stu-alisa");
    expect(ids).not.toContain("stu-timur");
  } finally {
    await restore(l, marker);
  }
});

test("перенос в прошлое — ошибка у поля, пара не изменилась", async ({ browser }) => {
  const marker = `e2e-${randomUUID().slice(0, 8)}`;
  const l = await claimLesson(marker);
  try {
    const irina = await (await browser.newContext({ storageState: STORAGE.irina })).newPage();
    await irina.goto(`/staff/schedule?group=${l.groupId}&day=${mskDateKey(l.startsAt)}`);
    await irina
      .locator(`[data-lesson="${l.id}"]`)
      .getByRole("button", { name: /^Перенести:/ })
      .click();
    const dialog = irina.getByRole("dialog");
    // Вчера — точно прошлое (min у поля даты — подсказка браузеру; проверяет сервер)
    await dialog.getByLabel("Дата").fill(mskDateKey(addDays(mskStartOfDay(new Date()), -1)));
    await dialog.getByLabel("Начало").fill("10:00");
    await dialog.getByLabel("Причина").fill(`Проверка ${marker}`);
    await dialog.getByRole("button", { name: "Перенести пару" }).click();
    await expect(dialog.getByText("Это время уже прошло — выберите позже")).toBeVisible();
    await expect(dialog.getByLabel("Дата")).toHaveAttribute("aria-invalid", "true");
    const after = await withDb((c) =>
      c.query<{ startsAt: Date; change: string }>(
        `SELECT "startsAt", change FROM "Lesson" WHERE id = $1`,
        [l.id],
      ),
    );
    expect(after.rows[0]).toEqual({ startsAt: l.startsAt, change: "NONE" });
  } finally {
    await restore(l, marker);
  }
});
