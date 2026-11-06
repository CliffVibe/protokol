// Успеваемость (T07) на настоящем PostgreSQL с сидом + изоляция между студентами (S1).
// Только при TEST_DATABASE_URL (база пересеивается).
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { DEMO, SEED_PASSWORD_ENVS } from "../../prisma/seed-data";
import { runSeed } from "../../prisma/seed";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("успеваемость в PostgreSQL", async () => {
  process.env.DATABASE_URL = url;
  const { getDisciplineDetails, getGradesOverview } = await import("@/server/services/grades");
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

  const ctxOf = async (userId: string) => {
    const ctx = await loadStudentCtx(userId);
    if (!ctx) throw new Error(`нет студента ${userId}`);
    return ctx;
  };

  it("Тимур: долг прошлого семестра, стипендия под угрозой с причинами", async () => {
    const o = await getGradesOverview(await ctxOf(DEMO.timur.userId));
    expect(o.debts.map((g) => g.discipline.name)).toEqual(["Эконометрика"]);
    expect(o.summary?.scholarship).toEqual({
      kept: false,
      reasons: expect.arrayContaining(["Долг: Эконометрика", "Международные финансы: 54/100"]),
    });
    expect(o.semesters).toEqual([7, 6]);
  });

  it("Вера: оценок нет — сводки нет", async () => {
    const o = await getGradesOverview(await ctxOf(DEMO.vera.userId));
    expect(o.summary).toBeNull();
    expect(o.grades).toEqual([]);
  });

  it("изоляция: дисциплина только Алисы — у Тимура пусто (→ 404); у Алисы — есть", async () => {
    const alisaOnly = "dsc-tmo";
    expect(await getDisciplineDetails(await ctxOf(DEMO.alisa.userId), alisaOnly)).not.toBeNull();
    // Положительный контроль: в базе эта дисциплина есть, но не у Тимура
    expect(await prisma.grade.count({ where: { disciplineId: alisaOnly } })).toBeGreaterThan(0);
    expect(await getDisciplineDetails(await ctxOf(DEMO.timur.userId), alisaOnly)).toBeNull();
  });

  it("изоляция: общая дисциплина (английский) — каждому только свои баллы", async () => {
    const alisa = (await getDisciplineDetails(await ctxOf(DEMO.alisa.userId), "dsc-en"))!;
    const timur = (await getDisciplineDetails(await ctxOf(DEMO.timur.userId), "dsc-en"))!;
    expect(alisa.rows.map((r) => r.ratingPoints)).toEqual([94, 93]);
    expect(timur.rows.map((r) => r.ratingPoints)).toEqual([80]);
    expect(timur.currentSemester).toBe(7);
    // Ни одной строки чужого студента: строки Тимура совпадают с его строками в базе
    const own = await prisma.grade.count({
      where: { disciplineId: "dsc-en", student: { userId: DEMO.timur.userId } },
    });
    expect(timur.rows).toHaveLength(own);
  });

  it("несуществующая дисциплина — null", async () => {
    expect(await getDisciplineDetails(await ctxOf(DEMO.alisa.userId), "dsc-nope")).toBeNull();
  });
});
