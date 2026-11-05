// Интеграционные проверки сида на настоящем PostgreSQL.
// Запускаются ТОЛЬКО при TEST_DATABASE_URL (в CI — сервис postgres; локально — осознанно, база будет пересеяна).
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { verifyPassword } from "@/server/auth/password";
import { DEMO, SEED_PASSWORD_ENVS } from "../../prisma/seed-data";
import { runSeed } from "../../prisma/seed";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("сид в PostgreSQL", () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  // Пароли генерируем на лету: тест не знает и не хранит настоящих паролей жюри
  const passwords = Object.fromEntries(
    SEED_PASSWORD_ENVS.map((n) => [n, randomBytes(12).toString("hex")]),
  );

  beforeAll(async () => {
    await runSeed(prisma, { passwords });
  }, 60_000);
  afterAll(() => prisma.$disconnect());

  it("у всех пользователей passwordHash — argon2id (05-security, тест 6)", async () => {
    const users = await prisma.user.findMany({ select: { passwordHash: true } });
    expect(users.length).toBeGreaterThan(0);
    for (const u of users) expect(u.passwordHash.startsWith("$argon2id$")).toBe(true);
  });

  it("пароль из env подходит, чужой — нет", async () => {
    const alisa = await prisma.user.findUniqueOrThrow({ where: { login: DEMO.alisa.login } });
    expect(await verifyPassword(alisa.passwordHash, passwords[DEMO.alisa.passwordEnv]!)).toBe(true);
    expect(await verifyPassword(alisa.passwordHash, passwords[DEMO.timur.passwordEnv]!)).toBe(
      false,
    );
  });

  it("сотрудник видит заявки только своих факультетов (ФМО, МЭО), без МЖ и МП", async () => {
    const irina = await prisma.staff.findUniqueOrThrow({ where: { id: DEMO.irina.staffId } });
    const visible = await prisma.request.findMany({
      where: { student: { group: { program: { facultyId: { in: irina.facultyIds } } } } },
      select: {
        student: {
          select: {
            group: { select: { program: { select: { faculty: { select: { code: true } } } } } },
          },
        },
      },
    });
    const codes = new Set(visible.map((r) => r.student.group.program.faculty.code));
    expect([...codes].sort()).toEqual(["МЭО", "ФМО"]);
    const total = await prisma.request.count();
    expect(visible.length).toBeLessThan(total);
  });

  it("токены .ics уникальны и достаточно длинные (32 байта)", async () => {
    const students = await prisma.student.findMany({ select: { calendarToken: true } });
    const tokens = students.map((s) => s.calendarToken);
    expect(new Set(tokens).size).toBe(tokens.length);
    for (const t of tokens) expect(Buffer.from(t, "base64url").length).toBe(32);
  });

  it("новая заявка получает следующий seq без конфликта с сидом", async () => {
    const max = await prisma.request.aggregate({ _max: { seq: true } });
    const created = await prisma.request.create({
      data: {
        number: "С-2099-99999",
        studentId: DEMO.vera.studentId,
        typeId: "rqt-study_ru",
        payload: {},
      },
    });
    expect(created.seq).toBe((max._max.seq ?? 0) + 1);
  });

  it("db:reset-demo возвращает демо в исходное состояние", async () => {
    const ready = await prisma.request.findFirstOrThrow({
      where: { studentId: DEMO.alisa.studentId, status: "READY" },
    });
    await prisma.request.update({ where: { id: ready.id }, data: { status: "ISSUED" } });
    await prisma.notification.updateMany({
      where: { studentId: DEMO.alisa.studentId },
      data: { readAt: new Date() },
    });

    await runSeed(prisma, { passwords });

    const again = await prisma.request.findUniqueOrThrow({ where: { id: ready.id } });
    expect(again.status).toBe("READY");
    const unread = await prisma.notification.count({
      where: { studentId: DEMO.alisa.studentId, readAt: null },
    });
    expect(unread).toBeGreaterThan(0);
  }, 60_000);
});
