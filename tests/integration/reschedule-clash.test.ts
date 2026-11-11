// Перенос пары с проверкой накладок (T14+) на настоящем PostgreSQL с сидом: у группы уже пара, у студентов
// группы — языковая пара, преподаватель занят, аудитория занята → busy и пара не меняется; отменённая пара
// не мешает; подсказка аудиторий — только свободные номера корпуса. Только при TEST_DATABASE_URL.
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { addDays, mskAt, mskStartOfDay } from "@/lib/msk";
import { DEMO, SEED_PASSWORD_ENVS } from "../../prisma/seed-data";
import { runSeed } from "../../prisma/seed";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Перенос пары: накладки в PostgreSQL", async () => {
  process.env.DATABASE_URL = url;
  const repo = await import("@/server/repos/staff-schedule");
  const schedule = await import("@/server/services/schedule");
  const { loadStaffCtx } = await import("@/server/repos/auth");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const created: string[] = [];

  beforeAll(async () => {
    const passwords = Object.fromEntries(
      SEED_PASSWORD_ENVS.map((n) => [n, process.env[n] ?? randomBytes(12).toString("hex")]),
    );
    await runSeed(prisma, { now: new Date(), passwords });
  }, 60_000);
  afterAll(async () => {
    await prisma.lesson.deleteMany({ where: { id: { in: created } } });
    await prisma.$disconnect();
  });

  const irina = async () => (await loadStaffCtx(DEMO.irina.userId))!;
  // Вечер через 3–7 дней (у каждой проверки свой день — помехи не пересекаются): сид ставит пары до 19:00 — в 20:00+ накладок из сида нет
  const evening = (time: string, day = 3) => mskAt(addDays(mskStartOfDay(new Date()), day), time);
  const minutes = (d: Date, m: number) => new Date(+d + m * 60_000);

  /** Будущая пара 2МО-3 без изменений — её «переносим» (перенос с накладкой ничего не пишет). */
  const lessonOf2MO3 = () =>
    prisma.lesson.findFirstOrThrow({
      where: { group: { name: "2МО-3" }, change: "NONE", startsAt: { gt: new Date() } },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        groupId: true,
        startsAt: true,
        endsAt: true,
        building: true,
        room: true,
        teacherId: true,
        disciplineId: true,
      },
    });
  type L = Awaited<ReturnType<typeof lessonOf2MO3>>;

  /** Пара-помеха без группы (или языковая): только время, корпус, аудитория, преподаватель. */
  async function blocker(
    l: L,
    at: Date,
    extra: { teacherId?: string; room?: string; languageGroupId?: string; cancelled?: boolean },
  ) {
    const other = await prisma.teacher.findFirstOrThrow({
      where: { id: { not: l.teacherId } },
      select: { id: true },
    });
    const b = await prisma.lesson.create({
      data: {
        disciplineId: l.disciplineId,
        teacherId: extra.teacherId ?? other.id,
        kind: "SEMINAR",
        startsAt: at,
        endsAt: minutes(at, 80),
        building: l.building,
        room: extra.room ?? "9999",
        languageGroupId: extra.languageGroupId ?? null,
        change: extra.cancelled ? "CANCELLED" : "NONE",
      },
      select: { id: true },
    });
    created.push(b.id);
    return b.id;
  }

  const move = async (l: L, startsAt: Date, room: string | null = null) =>
    repo.rescheduleLesson(await irina(), {
      lessonId: l.id,
      expectedStartsAt: l.startsAt,
      startsAt,
      room,
      reason: "Проверка накладок",
    });

  const unchanged = async (l: L) =>
    expect(
      await prisma.lesson.findUniqueOrThrow({
        where: { id: l.id },
        select: { startsAt: true, change: true, room: true },
      }),
    ).toEqual({ startsAt: l.startsAt, change: "NONE", room: l.room });

  it("у группы в это время уже пара → busy «group» с дисциплиной и временем", async () => {
    const l = await lessonOf2MO3();
    const other = await prisma.lesson.findFirstOrThrow({
      where: { groupId: l.groupId, id: { not: l.id }, change: "NONE", startsAt: { gt: l.endsAt } },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true, endsAt: true, discipline: { select: { name: true } } },
    });
    const r = await move(l, minutes(other.startsAt, 30));
    expect(r).toEqual({
      result: "busy",
      clash: {
        kind: "group",
        discipline: other.discipline.name,
        startsAt: other.startsAt,
        endsAt: other.endsAt,
      },
    });
    await unchanged(l);
  });

  it("у студентов группы языковая пара → busy «language» со счётом студентов", async () => {
    const l = await lessonOf2MO3();
    const member = await prisma.studentLanguageGroup.findFirstOrThrow({
      where: { student: { groupId: l.groupId! } },
      select: { languageGroupId: true },
    });
    const n = await prisma.studentLanguageGroup.count({
      where: { languageGroupId: member.languageGroupId, student: { groupId: l.groupId! } },
    });
    const at = evening("20:00");
    await blocker(l, at, { languageGroupId: member.languageGroupId });
    const r = await move(l, at);
    expect(r).toMatchObject({ result: "busy", clash: { kind: "language", students: n } });
    await unchanged(l);
  });

  it("преподаватель занят → busy «teacher»; занята аудитория → busy «room»", async () => {
    const l = await lessonOf2MO3();
    const t = evening("20:00", 4);
    await blocker(l, t, { teacherId: l.teacherId, room: "9998" });
    expect(await move(l, t)).toMatchObject({ result: "busy", clash: { kind: "teacher" } });

    const at = evening("20:00", 5);
    await blocker(l, at, { room: l.room });
    expect(await move(l, at)).toMatchObject({
      result: "busy",
      clash: { kind: "room", building: l.building, room: l.room },
    });
    await unchanged(l);
  });

  it("подсказка: свободные аудитории корпуса без занятой; занятая другой парой не предлагается", async () => {
    const l = await lessonOf2MO3();
    const at = evening("20:00", 6);
    const slot = {
      building: l.building,
      room: l.room,
      startsAt: at,
      endsAt: minutes(at, 80),
      lessonId: l.id,
    };
    const before = await schedule.suggestRooms(await irina(), slot);
    expect(before.length).toBeGreaterThan(0);
    expect(before.length).toBeLessThanOrEqual(schedule.SUGGEST_ROOMS);
    expect(before).not.toContain(l.room);
    // Первую подсказанную занимаем другой парой — её больше не предлагают
    await blocker(l, at, { room: before[0]! });
    const after = await schedule.suggestRooms(await irina(), slot);
    expect(after).not.toContain(before[0]);
  });

  it("отменённая пара не мешает: перенос проходит, группа получает уведомления", async () => {
    const l = await lessonOf2MO3();
    const at = evening("20:00", 7);
    await blocker(l, at, { teacherId: l.teacherId, room: l.room, cancelled: true });
    const r = await move(l, at);
    expect(r).toMatchObject({ result: "ok" });
    const after = await prisma.lesson.findUniqueOrThrow({
      where: { id: l.id },
      select: { startsAt: true, change: true },
    });
    expect(after).toEqual({ startsAt: at, change: "MOVED" });
    // Вернуть пару: следующие файлы пересеивают базу, но этот — оставляем как было
    await prisma.lesson.update({
      where: { id: l.id },
      data: {
        startsAt: l.startsAt,
        endsAt: l.endsAt,
        change: "NONE",
        changeNote: null,
        originalStartsAt: null,
      },
    });
    await prisma.notification.deleteMany({ where: { body: { contains: "Проверка накладок" } } });
  });
});
