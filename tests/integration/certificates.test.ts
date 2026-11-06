// Справки (T10) на настоящем PostgreSQL с сидом: PDF только владельцу и только готовой неотозванной,
// публичная проверка не отдаёт ФИО и зачётку, отзыв — только своим факультетом и один раз (S1, S7).
// Только при TEST_DATABASE_URL.
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { DEMO, SEED_PASSWORD_ENVS } from "../../prisma/seed-data";
import { runSeed } from "../../prisma/seed";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("справки в PostgreSQL", async () => {
  process.env.DATABASE_URL = url;
  const repo = await import("@/server/repos/requests");
  const verify = await import("@/server/repos/verify");
  const certs = await import("@/server/services/certificates");
  const svc = await import("@/server/services/requests");
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
  /** Готовая справка Алисы из сида (на английском) */
  const alisaDoc = () =>
    prisma.issuedDocument.findFirstOrThrow({
      where: { revoked: false, request: { studentId: DEMO.alisa.studentId, status: "READY" } },
      select: { verifyToken: true, request: { select: { number: true } } },
    });

  it("PDF: своя готовая справка — данные есть; чужая — null (как несуществующая)", async () => {
    const doc = await alisaDoc();
    const alisa = await student(DEMO.alisa.userId);
    const timur = await student(DEMO.timur.userId);
    // Положительный контроль: Алиса свою получает
    const own = await certs.getMyCertificate(alisa, doc.request.number);
    expect(own?.verifyUrl).toMatch(new RegExp(`/verify/${doc.verifyToken}$`));
    expect(own?.language).toBe("en");
    expect(await certs.getMyCertificate(timur, doc.request.number)).toBeNull();
  });

  it("PDF: в выборке нет зачётки, оценок и токена календаря", async () => {
    const doc = await alisaDoc();
    const src = await repo.documentForPdf(await student(DEMO.alisa.userId), doc.request.number);
    const json = JSON.stringify(src);
    const recordBookNo = (
      await prisma.student.findUniqueOrThrow({
        where: { id: DEMO.alisa.studentId },
        select: { recordBookNo: true },
      })
    ).recordBookNo;
    expect(json).not.toContain(recordBookNo);
    for (const secret of ["recordBookNo", "calendarToken", "grades", "passwordHash"])
      expect(json, secret).not.toContain(secret);
  });

  it("PDF: заявка не готова — null", async () => {
    const alisa = await student(DEMO.alisa.userId);
    const notReady = await prisma.request.findFirstOrThrow({
      where: { studentId: DEMO.alisa.studentId, status: { in: ["SUBMITTED", "ACCEPTED"] } },
      select: { number: true },
    });
    expect(await certs.getMyCertificate(alisa, notReady.number)).toBeNull();
  });

  it("/verify: статус, тип, дата и только инициалы", async () => {
    const doc = await alisaDoc();
    const v = await verify.documentByToken(doc.verifyToken, new Date());
    expect(v).toMatchObject({ state: "valid", typeCode: "study_en", language: "en" });
    expect(v!.holder).toMatch(/^[A-Z][a-z]+ [A-Z]\. [A-Z]\.$/);
    const full = await prisma.student.findUniqueOrThrow({
      where: { id: DEMO.alisa.studentId },
      select: { firstName: true, middleName: true, recordBookNo: true },
    });
    const json = JSON.stringify(v);
    expect(json).not.toContain(full.firstName);
    expect(json).not.toContain(full.recordBookNo);
    expect(Object.keys(v!).sort()).toEqual(
      ["holder", "issuedAt", "language", "state", "typeCode", "typeTitle", "validUntil"].sort(),
    );
    expect(await verify.documentByToken("A".repeat(22), new Date())).toBeNull();
  });

  it("/verify: срок истёк — «expired»", async () => {
    const doc = await alisaDoc();
    const later = new Date(Date.now() + 400 * 24 * 3600 * 1000);
    expect((await verify.documentByToken(doc.verifyToken, later))?.state).toBe("expired");
  });

  it("отзыв: чужой факультет — not_found и документ не тронут", async () => {
    const staff = await irina();
    const foreign = await prisma.request.findFirstOrThrow({
      where: { student: { group: { program: { facultyId: { notIn: staff.facultyIds } } } } },
      select: { id: true, number: true },
    });
    // Положительный контроль: у чужой заявки документ есть — создаём его здесь (база тестовая)
    await prisma.issuedDocument.upsert({
      where: { requestId: foreign.id },
      create: {
        requestId: foreign.id,
        verifyToken: randomBytes(16).toString("base64url"),
        issuedAt: new Date(),
      },
      update: { revoked: false },
    });
    expect(
      await svc.revokeCertificate(staff, { number: foreign.number, reason: "Тест чужого" }),
    ).toBe("not_found");
    const after = await prisma.issuedDocument.findUniqueOrThrow({
      where: { requestId: foreign.id },
      select: { revoked: true },
    });
    expect(after.revoked).toBe(false);
  });

  it("отзыв своим: ok, причина и автор сохранены, уведомление студенту; повтор — conflict", async () => {
    const staff = await irina();
    const doc = await alisaDoc();
    const number = doc.request.number;
    const before = await prisma.notification.count({ where: { studentId: DEMO.alisa.studentId } });
    expect(await svc.revokeCertificate(staff, { number, reason: "Ошибка в дате" })).toBe("ok");
    expect(await svc.revokeCertificate(staff, { number, reason: "Ещё раз" })).toBe("conflict");

    const saved = await prisma.issuedDocument.findUniqueOrThrow({
      where: { verifyToken: doc.verifyToken },
      select: { revoked: true, revokedReason: true, revokedByUserId: true, revokedAt: true },
    });
    expect(saved).toMatchObject({
      revoked: true,
      revokedReason: "Ошибка в дате",
      revokedByUserId: DEMO.irina.userId,
    });
    expect(saved.revokedAt).toBeInstanceOf(Date);
    expect(await prisma.notification.count({ where: { studentId: DEMO.alisa.studentId } })).toBe(
      before + 1,
    );

    // После отзыва: проверка — «revoked» без причины, PDF больше не выдаётся
    const v = await verify.documentByToken(doc.verifyToken, new Date());
    expect(v?.state).toBe("revoked");
    expect(JSON.stringify(v)).not.toContain("Ошибка в дате");
    expect(await certs.getMyCertificate(await student(DEMO.alisa.userId), number)).toBeNull();
  });
});
