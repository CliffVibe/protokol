// Демо-стенд общий для экспертов (T14): одноразовые сценарии студента возвращаются при его демо-входе,
// если прошлый посетитель прошёл их больше 15 минут назад. Свежее не трогаем; чужого студента — тоже.
// Только при TEST_DATABASE_URL.
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { DEMO, SEED_PASSWORD_ENVS } from "../../prisma/seed-data";
import { runSeed } from "../../prisma/seed";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("возврат демо-сценариев при входе", async () => {
  process.env.DATABASE_URL = url;
  const offers = await import("@/server/services/offers");
  const requests = await import("@/server/services/requests");
  const now = await import("@/server/services/now");
  const { restoreDemoScenarios, restoreStaffDemo, RESTORE_AFTER_MS } =
    await import("@/server/repos/demo");
  const { loadStaffCtx, loadStudentCtx } = await import("@/server/repos/auth");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  beforeAll(async () => {
    const passwords = Object.fromEntries(
      SEED_PASSWORD_ENVS.map((n) => [n, process.env[n] ?? randomBytes(12).toString("hex")]),
    );
    await runSeed(prisma, { now: new Date(), passwords });
  }, 60_000);
  afterAll(async () => {
    // Вернуть базу к сиду для следующих файлов
    const passwords = Object.fromEntries(
      SEED_PASSWORD_ENVS.map((n) => [n, process.env[n] ?? randomBytes(12).toString("hex")]),
    );
    await runSeed(prisma, { now: new Date(), passwords });
    await prisma.$disconnect();
  }, 60_000);

  const alisa = async () => (await loadStudentCtx(DEMO.alisa.userId))!;
  const offerCodes = async () => (await now.getNowFeed(await alisa()))!.offers.map((o) => o.code);
  const readyNumber = async () =>
    (
      await prisma.request.findFirstOrThrow({
        where: { studentId: DEMO.alisa.studentId, status: "READY", offered: false },
        select: { number: true },
      })
    ).number;

  it("предложение принято и заявка оценена — через 15 минут при входе всё возвращается", async () => {
    const ctx = await alisa();
    expect(await offerCodes()).toEqual(["scholarship_up"]);
    const accepted = await offers.acceptOffer(ctx, "scholarship_up", randomUUID());
    if (!accepted.ok) throw new Error("предложение не принято");
    // Как будто сотрудник уже ответил по ней: уведомление со ссылкой на заявку
    const link = `/requests/${encodeURIComponent(accepted.number)}`;
    await prisma.notification.create({
      data: {
        studentId: DEMO.alisa.studentId,
        kind: "REQUEST_STATUS",
        title: "Принята",
        body: "…",
        link,
      },
    });
    const number = await readyNumber();
    expect(await requests.rateMyRequest(ctx, number, { rating: 5, comment: "Быстро" })).toBe(true);
    expect(await offerCodes()).toEqual([]);

    // Вход сразу — свежее не трогаем: эксперт видит свою заявку и свою оценку
    await restoreDemoScenarios(DEMO.alisa.userId, new Date(Date.now() + 60_000));
    expect(await offerCodes()).toEqual([]);
    expect(
      await prisma.request.count({ where: { studentId: DEMO.alisa.studentId, offered: true } }),
    ).toBe(1);

    // Следующий эксперт через 15+ минут — карточка и форма оценки снова на месте
    await restoreDemoScenarios(DEMO.alisa.userId, new Date(Date.now() + RESTORE_AFTER_MS + 60_000));
    expect(await offerCodes()).toEqual(["scholarship_up"]);
    expect(
      await prisma.request.count({ where: { studentId: DEMO.alisa.studentId, offered: true } }),
    ).toBe(0);
    const rated = await prisma.request.findUniqueOrThrow({
      where: { number },
      select: { rating: true, ratingComment: true, ratedAt: true },
    });
    expect(rated).toEqual({ rating: null, ratingComment: null, ratedAt: null });
    // Уведомлений об удалённой заявке не осталось
    expect(await prisma.notification.count({ where: { link } })).toBe(0);
  });

  it("«Не сейчас» по предложению тоже возвращается; другого студента это не задевает", async () => {
    const ctx = await alisa();
    await offers.dismissMyOffer(ctx, "scholarship_up");
    expect(await offerCodes()).toEqual([]);
    const timurBefore = await prisma.request.count({ where: { studentId: DEMO.timur.studentId } });

    await restoreDemoScenarios(DEMO.timur.userId, new Date(Date.now() + RESTORE_AFTER_MS + 60_000));
    expect(await offerCodes()).toEqual([]); // у Алисы ничего не поменялось
    expect(await prisma.request.count({ where: { studentId: DEMO.timur.studentId } })).toBe(
      timurBefore,
    );

    await restoreDemoScenarios(DEMO.alisa.userId, new Date(Date.now() + RESTORE_AFTER_MS + 60_000));
    expect(await offerCodes()).toEqual(["scholarship_up"]);
  });

  it("сотрудник (нет записи студента) — ничего не происходит", async () => {
    const before = await prisma.request.count();
    await restoreDemoScenarios(DEMO.irina.userId, new Date(Date.now() + RESTORE_AFTER_MS + 60_000));
    expect(await prisma.request.count()).toBe(before);
  });

  it("Ирина выдала справку — через 15 минут её демо-вход возвращает «Готова» (сценарий 4 для следующего эксперта)", async () => {
    const irina = (await loadStaffCtx(DEMO.irina.userId))!;
    const number = await readyNumber();
    const eventsBefore = await prisma.requestEvent.count({ where: { request: { number } } });
    expect(
      await requests.setStatus(irina, { number, from: "READY", to: "ISSUED", comment: null }),
    ).toBe("ok");
    const status = async () =>
      (await prisma.request.findUniqueOrThrow({ where: { number }, select: { status: true } }))
        .status;
    expect(await status()).toBe("ISSUED");

    // Сразу — не трогаем: эксперт видит свой результат
    await restoreStaffDemo(DEMO.irina.userId, new Date(Date.now() + 60_000));
    expect(await status()).toBe("ISSUED");

    await restoreStaffDemo(DEMO.irina.userId, new Date(Date.now() + RESTORE_AFTER_MS + 60_000));
    expect(await status()).toBe("READY");
    expect(await prisma.requestEvent.count({ where: { request: { number } } })).toBe(eventsBefore);
    // Справка из сида на месте — QR «Готовой» работает
    expect(await prisma.issuedDocument.count({ where: { request: { number } } })).toBe(1);
  });
});
