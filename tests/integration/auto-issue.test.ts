// «Справка за 10 секунд» (T14+) на настоящем PostgreSQL с сидом: кабинет сам выдаёт типовую справку
// (статус, шаги, документ с QR, уведомление), исключения идут к сотруднику с причиной, лимит, повтор формы,
// брифинг и вкладка сотрудника — только своих факультетов (S1), возврат на демо-стенде. Только при TEST_DATABASE_URL.
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { DEMO, SEED_PASSWORD_ENVS } from "../../prisma/seed-data";
import { runSeed } from "../../prisma/seed";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("автовыдача справки в PostgreSQL", async () => {
  process.env.DATABASE_URL = url;
  const svc = await import("@/server/services/requests");
  const { documentByToken } = await import("@/server/repos/verify");
  const { restoreDemoScenarios, RESTORE_AFTER_MS } = await import("@/server/repos/demo");
  const { AUTO_ISSUE_LIMIT } = await import("@/server/services/auto-issue-rules");
  const { loadStaffCtx, loadStudentCtx } = await import("@/server/repos/auth");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const seed = () =>
    runSeed(prisma, {
      now: new Date(),
      passwords: Object.fromEntries(
        SEED_PASSWORD_ENVS.map((n) => [n, process.env[n] ?? randomBytes(12).toString("hex")]),
      ),
    });

  beforeAll(seed, 60_000);
  afterAll(async () => {
    await seed();
    await prisma.$disconnect();
  }, 60_000);

  const student = async (userId: string) => (await loadStudentCtx(userId))!;
  const submit = (userId: string, addressee: string, clientKey = randomUUID()) =>
    student(userId).then((ctx) =>
      svc.submitRequest(ctx, {
        code: "study_ru",
        language: "ru",
        payload: { addressee },
        clientKey,
      }),
    );
  const load = (number: string) =>
    prisma.request.findUniqueOrThrow({
      where: { number },
      select: {
        status: true,
        autoIssued: true,
        payload: true,
        events: { orderBy: { createdAt: "asc" }, select: { status: true, comment: true } },
        document: { select: { verifyToken: true } },
      },
    });

  it("Алиса, адресат пустой → «Выдана» сразу: шаги, справка с QR, уведомление; повтор формы — та же заявка", async () => {
    const key = randomUUID();
    const r = await submit(DEMO.alisa.userId, "", key);
    if (!r.ok) throw new Error("не подано");
    const saved = await load(r.number);
    expect(saved).toMatchObject({
      status: "ISSUED",
      autoIssued: true,
      payload: { addressee: "По месту требования" },
    });
    expect(saved.events.map((e) => e.status)).toEqual([
      "SUBMITTED",
      "ACCEPTED",
      "IN_PROGRESS",
      "READY",
      "ISSUED",
    ]);
    expect(saved.events[1]!.comment).toMatch(/Принята автоматически/);
    // QR-проверка работает сразу
    expect(await documentByToken(saved.document!.verifyToken, new Date())).toMatchObject({
      state: "valid",
    });
    expect(
      await prisma.notification.count({
        where: {
          studentId: DEMO.alisa.studentId,
          title: "Справка готова",
          link: { contains: "requests" },
        },
      }),
    ).toBeGreaterThanOrEqual(1);
    // Двойное нажатие — та же заявка, второй справки нет
    const again = await submit(DEMO.alisa.userId, "", key);
    expect(again).toEqual(r);
    expect(await prisma.issuedDocument.count({ where: { request: { number: r.number } } })).toBe(1);
  });

  it("свой адресат → обычная заявка, причина у «Подана»", async () => {
    const r = await submit(DEMO.alisa.userId, "В банк «Пример»");
    if (!r.ok) throw new Error("не подано");
    const saved = await load(r.number);
    expect(saved).toMatchObject({ status: "SUBMITTED", autoIssued: false, document: null });
    expect(saved.events[0]!.comment).toMatch(/^Посмотрит сотрудник: свой адресат попадёт/);
  });

  it("Тимур (долг) → к сотруднику, даже с типовым адресатом", async () => {
    const r = await submit(DEMO.timur.userId, "");
    if (!r.ok) throw new Error("не подано");
    const saved = await load(r.number);
    expect(saved).toMatchObject({ status: "SUBMITTED", autoIssued: false });
    expect(saved.events[0]!.comment).toMatch(/долг по сессии/);
  });

  it(`лимит: больше ${AUTO_ISSUE_LIMIT} за месяц — следующая к сотруднику`, async () => {
    const before = await prisma.request.count({
      where: { studentId: DEMO.alisa.studentId, autoIssued: true },
    });
    for (let i = before; i < AUTO_ISSUE_LIMIT; i++) {
      const r = await submit(DEMO.alisa.userId, "");
      if (!r.ok) throw new Error("не подано");
      expect((await load(r.number)).autoIssued).toBe(true);
    }
    const over = await submit(DEMO.alisa.userId, "");
    if (!over.ok) throw new Error("не подано");
    expect(await load(over.number)).toMatchObject({ status: "SUBMITTED", autoIssued: false });
  });

  it("сотрудник: брифинг и вкладка «Выдал кабинет» — только свои факультеты (МЖ не видно)", async () => {
    const irina = (await loadStaffCtx(DEMO.irina.userId))!;
    const now = new Date();
    const b = await svc.getBriefing(irina, now);
    const { items } = await svc.getQueue(
      irina,
      { statuses: ["ISSUED"], facultyId: null, typeCode: null, autoIssued: true },
      now,
    );
    expect(items.every((i) => i.autoIssued)).toBe(true);
    expect(items.map((i) => i.student.lastName)).not.toContain("Демидов");
    expect(b.autoIssued).toBe(items.length);
    // Положительный контроль: справка Демидова (МЖ) в базе есть — Ирина её просто не видит
    expect(
      await prisma.request.count({ where: { studentId: "stu-demidov", autoIssued: true } }),
    ).toBe(1);
  });

  it("демо-стенд: через 15 минут демо-вход Алисы убирает выданные кабинетом справки", async () => {
    await restoreDemoScenarios(DEMO.alisa.userId, new Date(Date.now() + RESTORE_AFTER_MS + 60_000));
    expect(
      await prisma.request.count({ where: { studentId: DEMO.alisa.studentId, autoIssued: true } }),
    ).toBe(0);
    // Фоновые справки сида не трогаем
    expect(await prisma.request.count({ where: { autoIssued: true } })).toBe(3);
  });
});
