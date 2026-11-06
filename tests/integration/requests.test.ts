// Заявки (T08) на настоящем PostgreSQL с сидом: номера, двойная отправка, отмена, переходы,
// конфликт двух сотрудников, изоляция студентов и факультетов (S1). Только при TEST_DATABASE_URL.
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { DEMO, SEED_PASSWORD_ENVS } from "../../prisma/seed-data";
import { runSeed } from "../../prisma/seed";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("заявки в PostgreSQL", async () => {
  process.env.DATABASE_URL = url;
  const svc = await import("@/server/services/requests");
  const repo = await import("@/server/repos/requests");
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
  const irina = async () => (await loadStaffCtx(DEMO.irina.userId))!;
  const submit = (ctx: Awaited<ReturnType<typeof student>>, clientKey = randomUUID()) =>
    svc.submitRequest(ctx, {
      code: "study_ru",
      language: "ru",
      payload: { addressee: "По месту работы", studentId: "stu-timur" },
      clientKey,
    });

  it("подача: номер по порядку, событие «Подана» от студента, лишние поля формы не сохраняются", async () => {
    const alisa = await student(DEMO.alisa.userId);
    const a = await submit(alisa);
    const b = await submit(alisa);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.number).toMatch(/^С-\d{4}-\d{5}$/);
    expect(Number(b.number.slice(-5))).toBe(Number(a.number.slice(-5)) + 1);
    const saved = await prisma.request.findUniqueOrThrow({
      where: { number: a.number },
      select: {
        studentId: true,
        payload: true,
        status: true,
        events: { select: { status: true, actorUserId: true } },
      },
    });
    // studentId из формы проигнорирован: заявка — Алисы, из сессии
    expect(saved).toEqual({
      studentId: DEMO.alisa.studentId,
      payload: { addressee: "По месту работы" },
      status: "SUBMITTED",
      events: [{ status: "SUBMITTED", actorUserId: DEMO.alisa.userId }],
    });
  });

  it("двойная отправка (тот же clientKey) — одна заявка, тот же номер", async () => {
    const alisa = await student(DEMO.alisa.userId);
    const key = randomUUID();
    const [a, b] = await Promise.all([submit(alisa, key), submit(alisa, key)]);
    expect(a.ok && b.ok && a.number === b.number).toBe(true);
    expect(await prisma.request.count({ where: { clientKey: key } })).toBe(1);
  });

  it("неверные поля — ошибки у полей, заявка не создана", async () => {
    const alisa = await student(DEMO.alisa.userId);
    const before = await prisma.request.count();
    const r = await svc.submitRequest(alisa, {
      code: "study_ru",
      language: "en",
      payload: { addressee: "   " },
      clientKey: randomUUID(),
    });
    expect(r).toEqual({
      ok: false,
      fieldErrors: { language: "Выберите язык справки", addressee: "Заполните поле" },
    });
    expect(await prisma.request.count()).toBe(before);
  });

  it("отмена: чужую — нельзя (статус прежний), принятую — нельзя, свою поданную — можно", async () => {
    const alisa = await student(DEMO.alisa.userId);
    const timur = await student(DEMO.timur.userId);
    const mine = await submit(alisa);
    if (!mine.ok) throw new Error("не создалась");

    expect(await repo.cancelRequest(timur, mine.number)).toBe(false);
    expect(
      (await prisma.request.findUniqueOrThrow({ where: { number: mine.number } })).status,
    ).toBe("SUBMITTED");

    const accepted = await prisma.request.findFirstOrThrow({
      where: { studentId: DEMO.alisa.studentId, status: "ACCEPTED" },
      select: { number: true },
    });
    expect(await repo.cancelRequest(alisa, accepted.number)).toBe(false);

    expect(await repo.cancelRequest(alisa, mine.number)).toBe(true);
    const after = await prisma.request.findUniqueOrThrow({
      where: { number: mine.number },
      select: { status: true, events: { orderBy: { createdAt: "asc" }, select: { status: true } } },
    });
    expect(after.status).toBe("CANCELLED");
    expect(after.events.map((e) => e.status)).toEqual(["SUBMITTED", "CANCELLED"]);
    // Повторная отмена — уже нельзя
    expect(await repo.cancelRequest(alisa, mine.number)).toBe(false);
  });

  it("чужая заявка по номеру — null (→ 404), своя — с таймлайном", async () => {
    const alisa = await student(DEMO.alisa.userId);
    const timur = await student(DEMO.timur.userId);
    const own = await prisma.request.findFirstOrThrow({
      where: { studentId: DEMO.alisa.studentId },
      select: { number: true },
    });
    expect(await svc.getMyRequest(timur, own.number)).toBeNull();
    expect((await svc.getMyRequest(alisa, own.number))?.timeline.steps.length).toBeGreaterThan(0);
  });

  it("сотрудник: путь Подана → Принята → В работе → Готова — события, уведомления, документ при «Готова»", async () => {
    const alisa = await student(DEMO.alisa.userId);
    const staff = await irina();
    const r = await submit(alisa);
    if (!r.ok) throw new Error("не создалась");
    const go = (
      from: "SUBMITTED" | "ACCEPTED" | "IN_PROGRESS",
      to: "ACCEPTED" | "IN_PROGRESS" | "READY",
    ) =>
      svc.setStatus(staff, {
        number: r.number,
        from,
        to,
        comment: to === "ACCEPTED" ? "Приняли" : null,
      });

    expect(await go("SUBMITTED", "ACCEPTED")).toBe("ok");
    expect(await go("ACCEPTED", "IN_PROGRESS")).toBe("ok");
    expect(await go("IN_PROGRESS", "READY")).toBe("ok");

    const saved = await prisma.request.findUniqueOrThrow({
      where: { number: r.number },
      select: {
        status: true,
        document: { select: { verifyToken: true } },
        events: {
          orderBy: { createdAt: "asc" },
          select: { status: true, comment: true, actorUserId: true },
        },
      },
    });
    expect(saved.status).toBe("READY");
    expect(saved.events.slice(1)).toEqual([
      { status: "ACCEPTED", comment: "Приняли", actorUserId: DEMO.irina.userId },
      { status: "IN_PROGRESS", comment: null, actorUserId: DEMO.irina.userId },
      { status: "READY", comment: null, actorUserId: DEMO.irina.userId },
    ]);
    // 16 байт в base64url — 22 символа (128 бит, S7)
    expect(saved.document?.verifyToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const notes = await prisma.notification.findMany({
      where: { studentId: DEMO.alisa.studentId, link: { contains: encodeURIComponent(r.number) } },
      select: { title: true },
    });
    expect(notes.map((n) => n.title).sort()).toEqual([
      "Заявка в работе",
      "Заявка принята",
      "Справка готова",
    ]);
  });

  it("сотрудник: недопустимый переход и устаревший from — отказ, статус прежний", async () => {
    const alisa = await student(DEMO.alisa.userId);
    const staff = await irina();
    const r = await submit(alisa);
    if (!r.ok) throw new Error("не создалась");
    expect(
      await svc.setStatus(staff, {
        number: r.number,
        from: "SUBMITTED",
        to: "READY",
        comment: null,
      }),
    ).toBe("forbidden_transition");
    // Два сотрудника разом: первый принял, второй жмёт «Принять» со старым from
    expect(
      await svc.setStatus(staff, {
        number: r.number,
        from: "SUBMITTED",
        to: "ACCEPTED",
        comment: null,
      }),
    ).toBe("ok");
    expect(
      await svc.setStatus(staff, {
        number: r.number,
        from: "SUBMITTED",
        to: "REJECTED",
        comment: "Поздно",
      }),
    ).toBe("conflict");
    expect((await prisma.request.findUniqueOrThrow({ where: { number: r.number } })).status).toBe(
      "ACCEPTED",
    );
  });

  it("изоляция факультетов: очередь Ирины — без чужих факультетов и без лишних полей студента", async () => {
    const staff = await irina();
    const all = [
      "SUBMITTED",
      "ACCEPTED",
      "IN_PROGRESS",
      "READY",
      "ISSUED",
      "REJECTED",
      "CANCELLED",
    ] as const;
    const { items } = await svc.getQueue(
      staff,
      { statuses: [...all], facultyId: null, typeCode: null },
      new Date(),
    );
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) expect(staff.facultyIds).toContain(i.student.group.program.faculty.id);
    const json = JSON.stringify(items);
    for (const secret of ["recordBookNo", "calendarToken", "passwordHash", "userId"])
      expect(json, secret).not.toContain(secret);

    // Положительный контроль: заявки чужого факультета в базе есть — и по номеру Ирине не видны
    const foreign = await prisma.request.findFirst({
      where: { student: { group: { program: { facultyId: { notIn: staff.facultyIds } } } } },
      select: { number: true },
    });
    expect(foreign, "в сиде есть заявка чужого факультета").not.toBeNull();
    expect(items.map((i) => i.number)).not.toContain(foreign!.number);
    expect(await svc.getStaffRequest(staff, foreign!.number)).toBeNull();
    expect(
      await svc.setStatus(staff, {
        number: foreign!.number,
        from: "SUBMITTED",
        to: "ACCEPTED",
        comment: null,
      }),
    ).toBe("not_found");
  });

  it("фильтр факультета не расширяет доступ: чужой id — пусто", async () => {
    const staff = await irina();
    const { items } = await svc.getQueue(
      staff,
      { statuses: ["SUBMITTED"], facultyId: "fac-not-mine", typeCode: null },
      new Date(),
    );
    expect(items).toEqual([]);
  });

  // Последним: пересевает базу (security-reviewer, T08 — сброс не чаще раза в 5 минут)
  it("«Сбросить демо»: второй сброс сразу после первого — отказ с временем ожидания", async () => {
    const { resetDemoData, RESET_COOLDOWN_MS } = await import("@/server/repos/demo");
    const staff = await irina();
    const t0 = Date.now();
    expect(await resetDemoData(staff, t0)).toEqual({ ok: true });
    expect(await resetDemoData(staff, t0 + 60_000)).toEqual({ ok: false, retryInMinutes: 4 });
    expect(RESET_COOLDOWN_MS).toBe(5 * 60 * 1000);
    // Сброс действительно вернул сид: заявок ровно столько, сколько в сиде
    expect(await prisma.request.count()).toBe(8);
  }, 60_000);
});
