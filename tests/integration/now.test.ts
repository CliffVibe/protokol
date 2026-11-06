// Лента «Сейчас» на настоящем PostgreSQL с сидом от «сейчас» (T05) + изоляция между студентами (S1).
// Только при TEST_DATABASE_URL (база пересеивается).
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { DEMO, SEED_PASSWORD_ENVS } from "../../prisma/seed-data";
import { runSeed } from "../../prisma/seed";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("лента «Сейчас» в PostgreSQL", async () => {
  process.env.DATABASE_URL = url;
  const { getNowFeed } = await import("@/server/services/now");
  const { loadStudentCtx } = await import("@/server/repos/auth");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const now = new Date();

  beforeAll(async () => {
    const passwords = Object.fromEntries(
      SEED_PASSWORD_ENVS.map((n) => [n, process.env[n] ?? randomBytes(12).toString("hex")]),
    );
    await runSeed(prisma, { now, passwords });
  }, 60_000);
  afterAll(() => prisma.$disconnect());

  const feedOf = async (userId: string) => {
    const ctx = await loadStudentCtx(userId);
    if (!ctx) throw new Error(`нет студента ${userId}`);
    const feed = await getNowFeed(ctx, now);
    if (!feed) throw new Error("пустая лента");
    return { ctx, feed };
  };

  it("Алиса: перенос сегодня, заявка «Готова», стипендия сохраняется", async () => {
    const { feed } = await feedOf(DEMO.alisa.userId);
    expect(feed.firstName).toBe("Алиса");
    expect(feed.changes.some((l) => l.change === "MOVED")).toBe(true);
    expect(feed.requests[0]?.status).toBe("READY");
    expect(feed.study?.scholarship).toEqual({ kept: true });
    expect(feed.next).not.toBeNull();
  });

  it("Тимур: экзамен в «Скоро», стипендия под угрозой с причиной", async () => {
    const { feed } = await feedOf(DEMO.timur.userId);
    expect(feed.soon.some((s) => s.kind === "exam")).toBe(true);
    expect(feed.study?.scholarship.kept).toBe(false);
    expect(feed.study?.debts).toBeGreaterThan(0);
  });

  it("Вера: ни заявок, ни оценок — пустые блоки, а не чужие данные", async () => {
    const { feed } = await feedOf(DEMO.vera.userId);
    expect(feed.requests).toEqual([]);
    expect(feed.study).toBeNull();
  });

  it("изоляция: в ленте Тимура нет заявок и пар Алисы", async () => {
    const alisa = await feedOf(DEMO.alisa.userId);
    const timur = await feedOf(DEMO.timur.userId);
    const alisaNumbers = (
      await prisma.request.findMany({
        where: { studentId: alisa.ctx.studentId },
        select: { number: true },
      })
    ).map((r) => r.number);
    expect(alisaNumbers.length).toBeGreaterThan(0);
    for (const r of timur.feed.requests) expect(alisaNumbers).not.toContain(r.number);

    const alisaLessonIds = new Set(
      (
        await prisma.lesson.findMany({
          where: { groupId: { in: alisa.ctx.groupIds } },
          select: { id: true },
        })
      ).map((l) => l.id),
    );
    const timurLessons = [timur.feed.next?.lesson, ...timur.feed.changes].filter(Boolean);
    for (const l of timurLessons) expect(alisaLessonIds.has(l!.id)).toBe(false);
  });

  it("объявление только для МЭО не попадает к Алисе (ФМО)", async () => {
    const meoOnly = await prisma.announcement.findMany({
      where: { audience: { equals: { facultyCodes: ["МЭО"] } } },
      select: { id: true },
    });
    expect(meoOnly.length).toBeGreaterThan(0);
    const { feed } = await feedOf(DEMO.alisa.userId);
    for (const a of meoOnly) expect(feed.announcements.map((x) => x.id)).not.toContain(a.id);
  });
});
