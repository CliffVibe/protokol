// Подписка .ics и профиль (T11) на настоящем PostgreSQL с сидом: по токену — только пары своих групп
// и ничего о студенте; перевыпуск меняет только свой токен, старый перестаёт работать (S1, S7).
// Только при TEST_DATABASE_URL.
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { DEMO, SEED_PASSWORD_ENVS } from "../../prisma/seed-data";
import { runSeed } from "../../prisma/seed";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("календарь и профиль в PostgreSQL", async () => {
  process.env.DATABASE_URL = url;
  const calendar = await import("@/server/repos/calendar");
  const feed = await import("@/server/services/calendar");
  const profile = await import("@/server/repos/profile");
  const { loadStudentCtx } = await import("@/server/repos/auth");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  beforeAll(async () => {
    const passwords = Object.fromEntries(
      SEED_PASSWORD_ENVS.map((n) => [n, process.env[n] ?? randomBytes(12).toString("hex")]),
    );
    await runSeed(prisma, { now: new Date(), passwords });
  }, 60_000);
  afterAll(() => prisma.$disconnect());

  const now = new Date();
  const from = new Date(+now - 14 * 864e5);
  const to = new Date(+now + 90 * 864e5);

  const studentOf = (studentId: string) =>
    prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      select: {
        calendarToken: true,
        groupId: true,
        lastName: true,
        recordBookNo: true,
        group: { select: { name: true } },
        languageGroups: { select: { languageGroupId: true } },
      },
    });

  it("по токену — пары основной и языковых групп студента и только их", async () => {
    const alisa = await studentOf(DEMO.alisa.studentId);
    const lessons = await calendar.lessonsByCalendarToken(alisa.calendarToken, from, to);
    expect(lessons?.length).toBeGreaterThan(0);
    // Положительный контроль: те же пары, что видит сама Алиса в расписании
    const own = await prisma.lesson.findMany({
      where: {
        startsAt: { gte: from, lt: to },
        OR: [
          { groupId: alisa.groupId },
          { languageGroupId: { in: alisa.languageGroups.map((l) => l.languageGroupId) } },
        ],
      },
      select: { id: true },
    });
    expect(new Set(lessons!.map((l) => l.id))).toEqual(new Set(own.map((l) => l.id)));
    expect(alisa.languageGroups.length).toBeGreaterThan(0);

    // Пары группы Тимура (другой факультет) в подписку Алисы не попадают
    const timur = await studentOf(DEMO.timur.studentId);
    expect(timur.groupId).not.toBe(alisa.groupId);
    const timurOnly = await prisma.lesson.findFirstOrThrow({
      where: { groupId: timur.groupId, startsAt: { gte: from, lt: to } },
      select: { id: true },
    });
    expect(lessons!.some((l) => l.id === timurOnly.id)).toBe(false);
  });

  it("неизвестный токен → null", async () => {
    expect(
      await calendar.lessonsByCalendarToken(randomBytes(32).toString("base64url"), from, to),
    ).toBeNull();
  });

  it(".ics: пары есть, ФИО, зачётки и группы студента нет", async () => {
    const alisa = await studentOf(DEMO.alisa.studentId);
    const ics = await feed.calendarFeed(alisa.calendarToken, now);
    expect(ics).toContain("BEGIN:VEVENT");
    const unfolded = ics!.replace(/\r\n /g, "");
    expect(unfolded).not.toContain(alisa.lastName);
    expect(unfolded).not.toContain(alisa.recordBookNo);
    expect(unfolded).not.toContain(alisa.group.name);
  });

  it("перевыпуск: новый токен работает, старый — нет; чужой токен не тронут", async () => {
    const timurBefore = (await studentOf(DEMO.timur.studentId)).calendarToken;
    const alisaCtx = (await loadStudentCtx(DEMO.alisa.userId))!;
    const old = (await studentOf(DEMO.alisa.studentId)).calendarToken;
    const fresh = randomBytes(32).toString("base64url");

    expect(await profile.rotateCalendarToken(alisaCtx, fresh)).toBe(true);
    expect(await calendar.lessonsByCalendarToken(old, from, to)).toBeNull();
    expect((await calendar.lessonsByCalendarToken(fresh, from, to))?.length).toBeGreaterThan(0);
    expect((await profile.profileOf(alisaCtx))?.calendarToken).toBe(fresh);
    expect((await studentOf(DEMO.timur.studentId)).calendarToken).toBe(timurBefore);
  });

  it("профиль: свои данные, без номера зачётки", async () => {
    const alisaCtx = (await loadStudentCtx(DEMO.alisa.userId))!;
    const p = await profile.profileOf(alisaCtx);
    expect(p?.lastName).toBe((await studentOf(DEMO.alisa.studentId)).lastName);
    expect(JSON.stringify(p)).not.toContain((await studentOf(DEMO.alisa.studentId)).recordBookNo);
  });
});
