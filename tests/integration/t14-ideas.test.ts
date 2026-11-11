// T14 на настоящем PostgreSQL с сидом: «Вам положено» (J), оценка заявки (K), свободные аудитории (N).
// Изоляция (S1): чужую заявку не оценить, неподходящему студенту не подать «предложенное», аудитории —
// только номера без групп и людей. Только при TEST_DATABASE_URL.
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { DEMO, SEED_PASSWORD_ENVS } from "../../prisma/seed-data";
import { runSeed } from "../../prisma/seed";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("T14: предложения, оценки, аудитории в PostgreSQL", async () => {
  process.env.DATABASE_URL = url;
  const requests = await import("@/server/services/requests");
  const offers = await import("@/server/services/offers");
  const now = await import("@/server/services/now");
  const rooms = await import("@/server/repos/rooms");
  const { loadStaffCtx, loadStudentCtx } = await import("@/server/repos/auth");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  beforeAll(async () => {
    const passwords = Object.fromEntries(
      SEED_PASSWORD_ENVS.map((n) => [n, process.env[n] ?? randomBytes(12).toString("hex")]),
    );
    await runSeed(prisma, { now: new Date(), passwords });
  }, 60_000);
  afterAll(() => prisma.$disconnect());

  const student = async (userId: string) => (await loadStudentCtx(userId))!;
  const alisaReadyNumber = async () =>
    (
      await prisma.request.findFirstOrThrow({
        where: { studentId: DEMO.alisa.studentId, status: "READY" },
        select: { number: true },
      })
    ).number;

  describe("K. Оценка решения заявки", () => {
    it("Тимур не может оценить заявку Алисы — и она остаётся неоценённой", async () => {
      const timur = await student(DEMO.timur.userId);
      const number = await alisaReadyNumber();
      expect(await requests.rateMyRequest(timur, number, { rating: 1, comment: "чужая" })).toBe(
        false,
      );
      const r = await prisma.request.findUniqueOrThrow({
        where: { number },
        select: { rating: true },
      });
      expect(r.rating).toBeNull();
    });

    it("Алиса оценивает свою «Готова» один раз; «Принята» оценить нельзя", async () => {
      const alisa = await student(DEMO.alisa.userId);
      const number = await alisaReadyNumber();
      expect(await requests.rateMyRequest(alisa, number, { rating: 5, comment: "Быстро" })).toBe(
        true,
      );
      expect(await requests.rateMyRequest(alisa, number, { rating: 1, comment: null })).toBe(false);
      const r = await prisma.request.findUniqueOrThrow({
        where: { number },
        select: { rating: true, ratingComment: true, ratedAt: true },
      });
      expect(r).toMatchObject({ rating: 5, ratingComment: "Быстро" });
      expect(r.ratedAt).toBeInstanceOf(Date);

      const accepted = await prisma.request.findFirstOrThrow({
        where: { studentId: DEMO.alisa.studentId, status: "ACCEPTED" },
        select: { number: true },
      });
      expect(
        await requests.rateMyRequest(alisa, accepted.number, { rating: 4, comment: null }),
      ).toBe(false);
    });

    it("сводка у Ирины — только её факультеты и без ФИО студентов", async () => {
      const irina = (await loadStaffCtx(DEMO.irina.userId))!;
      const s = await requests.getRatingsSummary(irina);
      expect(s.count).toBeGreaterThanOrEqual(4);
      expect(JSON.stringify(s)).not.toMatch(/Петрова|Галиев|Савельев|Королёва|stu-/);
    });
  });

  describe("J. «Вам положено»", () => {
    it("Тимуру (долг) не положено: ни в ленте, ни подделкой формы", async () => {
      const timur = await student(DEMO.timur.userId);
      const feed = await now.getNowFeed(timur);
      expect(feed!.offers).toEqual([]);
      expect(await offers.acceptOffer(timur, "scholarship_up", randomUUID())).toEqual({
        ok: false,
      });
      const n = await prisma.request.count({
        where: { studentId: DEMO.timur.studentId, type: { code: "scholarship_up" } },
      });
      expect(n).toBe(0);
    });

    it("Алисе положено; «Не сейчас» прячет до следующего семестра, но подать всё ещё можно", async () => {
      const alisa = await student(DEMO.alisa.userId);
      expect((await now.getNowFeed(alisa))!.offers.map((o) => o.code)).toEqual(["scholarship_up"]);
      await offers.dismissMyOffer(alisa, "scholarship_up");
      await offers.dismissMyOffer(alisa, "scholarship_up"); // повтор безвреден
      expect((await now.getNowFeed(alisa))!.offers).toEqual([]);

      const key = randomUUID();
      const accepted = await offers.acceptOffer(alisa, "scholarship_up", key);
      expect(accepted.ok).toBe(true);
      // Двойное нажатие с тем же ключом — та же заявка; новая попытка — отказ (уже подано)
      expect(await offers.acceptOffer(alisa, "scholarship_up", key)).toEqual(accepted);
      expect(await offers.acceptOffer(alisa, "scholarship_up", randomUUID())).toEqual({
        ok: false,
      });
      const r = await prisma.request.findFirstOrThrow({
        where: { studentId: DEMO.alisa.studentId, type: { code: "scholarship_up" } },
        select: { offered: true, status: true },
      });
      expect(r).toEqual({ offered: true, status: "SUBMITTED" });
    });
  });

  describe("N. Свободные аудитории (сотруднику при переносе)", () => {
    it("roomUsage (подбор аудитории сотруднику) — только номер и время, без групп, дисциплин и людей", async () => {
      const irina = (await loadStaffCtx(DEMO.irina.userId))!;
      const from = new Date(Date.now() - 7 * 24 * 3600_000);
      const rows = await rooms.roomUsage(
        irina,
        "Главный корпус (пр-т Вернадского)",
        from,
        new Date(),
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) expect(Object.keys(r).sort()).toEqual(["endsAt", "room", "startsAt"]);
    });
  });
});
