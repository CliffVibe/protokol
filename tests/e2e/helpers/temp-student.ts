// Временный студент для e2e уведомлений (T09). Зачем: тесты считают непрочитанные и жмут «Отметить всё» —
// на демо-аккаунтах это сбивало бы и параллельные проекты (desktop, mobile-360, --repeat-each), и демо
// человека. У каждого теста — свой студент в группе Веры (МЖ): Ирина туда не пишет (не её факультет),
// а переносы тестов — у групп ФМО, поэтому чужие тесты его счётчик не трогают.
// Войти по паролю под ним нельзя: хеш — случайная строка, не результат argon2. Сессию кладём прямо в БД
// (sha256 токена — как делает сервер, S3), cookie — в контекст браузера. После теста — удаляем целиком
// (каскадом уходят студент, сессия, уведомления). Только локальная БД (helpers/db.ts).
import { createHash, randomBytes } from "node:crypto";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { withDb } from "./db";

export type TempStudent = {
  userId: string;
  studentId: string;
  page: Page;
  context: BrowserContext;
  /** Добавить уведомление; вернуть его id */
  notify: (n: {
    kind: "ANNOUNCEMENT" | "SCHEDULE_CHANGE" | "DEADLINE" | "REQUEST_STATUS";
    title: string;
    body?: string;
    link?: string | null;
    read?: boolean;
  }) => Promise<string>;
  remove: () => Promise<void>;
};

export async function tempStudent(browser: Browser, baseURL: string): Promise<TempStudent> {
  const key = randomBytes(6).toString("hex");
  const userId = `usr-e2e-${key}`;
  const studentId = `stu-e2e-${key}`;
  const token = randomBytes(32).toString("base64url");
  await withDb(async (c) => {
    const g = await c.query<{ groupId: string }>(
      `SELECT s."groupId" FROM "Student" s JOIN "User" u ON u.id = s."userId" WHERE u.login = 'student.new'`,
    );
    const groupId = g.rows[0]?.groupId;
    if (!groupId) throw new Error("В БД нет student.new — нужен сид");
    await c.query("BEGIN");
    try {
      await c.query(
        `INSERT INTO "User" (id, login, "passwordHash", role) VALUES ($1, $2, $3, 'STUDENT')`,
        [
          userId,
          `e2e.${key}`,
          `$argon2id$v=19$m=19456,t=2,p=1$e2e$${randomBytes(24).toString("hex")}`,
        ],
      );
      await c.query(
        `INSERT INTO "Student" (id, "userId", "lastName", "firstName", "recordBookNo", "groupId", "calendarToken")
         VALUES ($1, $2, 'Проверкина', 'Проба', $3, $4, $5)`,
        // calendarToken — как у настоящих студентов: 32 байта (T11, перевыпуск ссылки проверяется на нём)
        [studentId, userId, `E2E-${key}`, groupId, randomBytes(32).toString("base64url")],
      );
      await c.query(`INSERT INTO "Session" (id, "userId", "expiresAt") VALUES ($1, $2, $3)`, [
        createHash("sha256").update(token).digest("hex"),
        userId,
        new Date(Date.now() + 60 * 60 * 1000),
      ]);
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    }
  });

  const dropUser = () => withDb((c) => c.query(`DELETE FROM "User" WHERE id = $1`, [userId]));
  // Студент уже в БД: если браузер не поднимется, убираем его здесь же — afterEach о нём не узнает
  // (первый прогон T09 оставил 8 таких студентов, когда addCookies падал)
  const context = await browser
    .newContext({ storageState: { cookies: [], origins: [] } })
    .catch(async (e) => {
      await dropUser();
      throw e;
    });
  // Chromium не даёт задать Secure-cookie для http://-адреса, но принимает её для того же хоста по https://
  // и шлёт на http://localhost (безопасный контекст) — тот же приём, что в security.spec.ts
  const origin = new URL(baseURL);
  origin.protocol = "https:";
  await context
    .addCookies([
      {
        name: "__Host-session",
        value: token,
        url: origin.origin,
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
    ])
    .catch(async (e) => {
      await context.close().catch(() => {});
      await dropUser();
      throw e;
    });
  const page = await context.newPage();

  let seq = 0;
  return {
    userId,
    studentId,
    page,
    context,
    notify: async ({ kind, title, body = "Текст уведомления", link = null, read = false }) => {
      const id = `ntf-e2e-${key}-${++seq}`;
      await withDb((c) =>
        c.query(
          `INSERT INTO "Notification" (id, "studentId", kind, title, body, link, "readAt", "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, now() - ($8 || ' minutes')::interval)`,
          [id, studentId, kind, title, body, link, read ? new Date() : null, String(seq)],
        ),
      );
      return id;
    },
    remove: async () => {
      await context.close().catch(() => {});
      await dropUser();
    },
  };
}
