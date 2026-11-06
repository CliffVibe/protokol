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

  it("изоляция заявок: в ленте Тимура нет ни одной заявки Алисы", async () => {
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
  });

  it("изоляция пар: КАЖДАЯ пара Тимура — из его основной или языковой группы", async () => {
    // Проверяем репозиторий целиком, а не одну «ближайшую» пару (security-reviewer, T05)
    const { lessonsBetween } = await import("@/server/repos/schedule");
    const timur = await feedOf(DEMO.timur.userId);
    const from = new Date(now.getTime() - 14 * 24 * 3600 * 1000);
    const to = new Date(now.getTime() + 21 * 24 * 3600 * 1000);
    const rows = await lessonsBetween(timur.ctx, from, to);
    expect(rows.length).toBeGreaterThan(0);
    const own = await prisma.lesson.findMany({
      where: { id: { in: rows.map((l) => l.id) } },
      select: { id: true, groupId: true, languageGroupId: true },
    });
    for (const l of own) {
      const mine =
        (l.groupId !== null && timur.ctx.groupIds.includes(l.groupId)) ||
        (l.languageGroupId !== null && timur.ctx.languageGroupIds.includes(l.languageGroupId));
      expect(mine, l.id).toBe(true);
    }
  });

  it("адресаты: каждому — своё, и только своё (с положительным контролем)", async () => {
    const { announcementsFor, deadlinesFor } = await import("@/server/repos/announcements");
    const ids = async (userId: string) => {
      const { ctx } = await feedOf(userId);
      return {
        ann: (await announcementsFor(ctx, now)).map((a) => a.id),
        ddl: (await deadlinesFor(ctx, new Date(0))).map((d) => d.id),
      };
    };
    const alisa = await ids(DEMO.alisa.userId); // ФМО, 2 курс, 2МО-3
    const timur = await ids(DEMO.timur.userId); // МЭО, 4 курс
    const vera = await ids(DEMO.vera.userId); // МЖ, 1 курс

    expect(alisa.ann).toEqual(expect.arrayContaining(["ann-1", "ann-2", "ann-4", "ann-6"]));
    expect(alisa.ann).not.toContain("ann-3"); // только МЭО
    expect(alisa.ann).not.toContain("ann-5"); // только 1 курс

    expect(timur.ann).toEqual(expect.arrayContaining(["ann-1", "ann-2", "ann-3"]));
    expect(timur.ann).not.toContain("ann-6"); // только 2МО-3
    expect(timur.ann).not.toContain("ann-5");
    expect(timur.ddl).not.toContain("ddl-1"); // 2МО-3 и 2МО-1

    expect(vera.ann).toEqual(expect.arrayContaining(["ann-1", "ann-5"]));
    expect(vera.ann).not.toContain("ann-2"); // ФМО и МЭО
    expect(alisa.ddl).toContain("ddl-1");
  });
});
