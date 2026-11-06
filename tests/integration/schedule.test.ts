// Расписание (T06) на настоящем PostgreSQL с сидом от «сейчас» + изоляция между студентами (S1).
// Только при TEST_DATABASE_URL (база пересеивается).
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { addDays, mskStartOfDay, mskStartOfWeek, mskWeekday } from "@/lib/msk";
import { DEMO, SEED_PASSWORD_ENVS } from "../../prisma/seed-data";
import { runSeed } from "../../prisma/seed";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("расписание в PostgreSQL", async () => {
  process.env.DATABASE_URL = url;
  const { getDaySchedule, getWeekSchedule } = await import("@/server/services/schedule");
  const { loadStudentCtx } = await import("@/server/repos/auth");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const now = new Date();
  const thisWeek = mskStartOfWeek(now);

  beforeAll(async () => {
    const passwords = Object.fromEntries(
      SEED_PASSWORD_ENVS.map((n) => [n, process.env[n] ?? randomBytes(12).toString("hex")]),
    );
    await runSeed(prisma, { now, passwords });
  }, 60_000);
  afterAll(() => prisma.$disconnect());

  const ctxOf = async (userId: string) => {
    const ctx = await loadStudentCtx(userId);
    if (!ctx) throw new Error(`нет студента ${userId}`);
    return ctx;
  };
  const lessonsOf = (w: Awaited<ReturnType<typeof getWeekSchedule>>) =>
    w.days.flatMap((d) => d.items.map((i) => i.lesson));

  it("Алиса, эта неделя: перенос, отмена, языковые пары и переход в Одинцово в четверг", async () => {
    const week = await getWeekSchedule(await ctxOf(DEMO.alisa.userId), thisWeek);
    const lessons = lessonsOf(week);
    expect(lessons.some((l) => l.change === "MOVED" && l.originalStartsAt)).toBe(true);
    expect(lessons.some((l) => l.change === "CANCELLED")).toBe(true);
    expect(lessons.some((l) => l.languageGroup?.name)).toBe(true);
    expect(week.changes.length).toBeGreaterThanOrEqual(3);

    const thursday = week.days.find((d) => mskWeekday(d.start) === 4)!;
    const transitions = thursday.items.flatMap((i) => (i.transition ? [i.transition] : []));
    expect(transitions).toContainEqual(expect.objectContaining({ to: "Одинцово" }));
    expect(transitions.every((t) => t.breakMinutes > 0)).toBe(true);
  });

  it("Алиса, сегодня: всегда учебный день, перенос на месте", async () => {
    const today = await getDaySchedule(await ctxOf(DEMO.alisa.userId), mskStartOfDay(now));
    expect(today.day.items.length).toBeGreaterThan(0);
    expect(today.day.items.some((i) => i.lesson.change === "MOVED")).toBe(true);
    // Полоса недели — с выбранным днём
    expect(today.week.some((d) => d.key === today.day.key)).toBe(true);
  });

  it("Алиса, четверг отдельно: переход с временем перерыва — от конца пары до начала следующей", async () => {
    const thursday = await getDaySchedule(await ctxOf(DEMO.alisa.userId), addDays(thisWeek, 3));
    const items = thursday.day.items;
    const i = items.findIndex((x) => x.transition?.to === "Одинцово");
    expect(i).toBeGreaterThan(0);
    const t = items[i]!.transition!;
    expect(+t.endsAt).toBe(+items[i]!.lesson.startsAt);
    expect(+t.startsAt).toBe(+items[i - 1]!.lesson.endsAt);
    expect(t.breakMinutes).toBe((+t.endsAt - +t.startsAt) / 60_000);
  });

  it("изоляция: КАЖДАЯ пара недель Тимура — из его групп (с положительным контролем)", async () => {
    const timur = await ctxOf(DEMO.timur.userId);
    const rows = [
      ...lessonsOf(await getWeekSchedule(timur, thisWeek)),
      ...lessonsOf(await getWeekSchedule(timur, addDays(thisWeek, 7))),
    ];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((l) => l.change === "ROOM_CHANGED")).toBe(true);
    const own = await prisma.lesson.findMany({
      where: { id: { in: rows.map((l) => l.id) } },
      select: { id: true, groupId: true, languageGroupId: true },
    });
    expect(own).toHaveLength(rows.length);
    for (const l of own) {
      const mine =
        (l.groupId !== null && timur.groupIds.includes(l.groupId)) ||
        (l.languageGroupId !== null && timur.languageGroupIds.includes(l.languageGroupId));
      expect(mine, l.id).toBe(true);
    }
    // И ни одной пары 2МО-3 (группа Алисы), хотя в базе они есть
    const alisaGroupLessons = await prisma.lesson.count({ where: { groupId: "grp-2mo3" } });
    expect(alisaGroupLessons).toBeGreaterThan(0);
    expect(rows.some((l) => l.building === "Одинцово")).toBe(false);
  });

  it("неделя вне сида — пустые дни, а не ошибка", async () => {
    const far = await getWeekSchedule(await ctxOf(DEMO.alisa.userId), addDays(thisWeek, 7 * 10));
    expect(far.days).toHaveLength(6);
    expect(far.days.every((d) => d.items.length === 0)).toBe(true);
    expect(far.changes).toEqual([]);
  });
});
