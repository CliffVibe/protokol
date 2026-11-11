// T14+: инструменты деканата на настоящем PostgreSQL с сидом. Пакетная смена статуса — только свои
// факультеты, устаревшая не откатывает остальные, текст шаблона — для каждой заявки. База знаний — черновик
// обезличен, чужой факультет не виден, личное не публикуется, помощник отвечает опубликованным с подписью.
// Только при TEST_DATABASE_URL.
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { DEMO, SEED_PASSWORD_ENVS } from "../../prisma/seed-data";
import { runSeed } from "../../prisma/seed";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Инструменты деканата в PostgreSQL", async () => {
  process.env.DATABASE_URL = url;
  const requests = await import("@/server/services/requests");
  const faq = await import("@/server/services/faq-entries");
  const repo = await import("@/server/repos/faq-entries");
  const assistant = await import("@/server/services/ai/assistant");
  const { loadStaffCtx, loadStudentCtx } = await import("@/server/repos/auth");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  beforeAll(async () => {
    const passwords = Object.fromEntries(
      SEED_PASSWORD_ENVS.map((n) => [n, process.env[n] ?? randomBytes(12).toString("hex")]),
    );
    await runSeed(prisma, { now: new Date(), passwords });
  }, 60_000);
  afterAll(() => prisma.$disconnect());

  const irina = async () => (await loadStaffCtx(DEMO.irina.userId))!;
  const numberOf = async (studentId: string, type: string, status: string) =>
    (
      await prisma.request.findFirstOrThrow({
        where: { studentId, type: { code: type }, status: status as never },
        select: { number: true },
      })
    ).number;

  describe("пакетная обработка", () => {
    it("свои — принимаются с текстом шаблона, чужой факультет и устаревшая — нет", async () => {
      const zaitsev = await numberOf("stu-zaitsev", "study_ru", "SUBMITTED");
      const fomin = await numberOf("stu-fomin", "study_ru", "SUBMITTED");
      const demidov = await numberOf("stu-demidov", "study_ru", "SUBMITTED"); // МЖ — не Ирины
      const koroleva = await numberOf("stu-koroleva", "study_ru", "SUBMITTED");
      // Королёву «уже приняли» — сотрудник видел старый статус
      await prisma.request.update({ where: { number: koroleva }, data: { status: "ACCEPTED" } });

      const r = await requests.batchSetStatus(
        await irina(),
        {
          picks: [zaitsev, fomin, demidov, koroleva].map((number) => ({
            number,
            from: "SUBMITTED" as const,
          })),
          to: "ACCEPTED",
          template: "accept-due",
        },
        new Date(),
      );
      expect(r).toEqual({ done: 2, stale: 1, skipped: 1, ignored: 0 });

      const rows = await prisma.request.findMany({
        where: { number: { in: [zaitsev, fomin, demidov] } },
        select: { number: true, status: true },
      });
      expect(Object.fromEntries(rows.map((x) => [x.number, x.status]))).toEqual({
        [zaitsev]: "ACCEPTED",
        [fomin]: "ACCEPTED",
        [demidov]: "SUBMITTED",
      });
      const n = await prisma.notification.findFirstOrThrow({
        // Ссылка хранит номер в %-кодировке («С» — кириллица): ищем по студенту и виду
        where: { studentId: "stu-zaitsev", kind: "REQUEST_STATUS" },
        orderBy: { createdAt: "desc" },
        select: { body: true },
      });
      expect(n.body).toContain("Приняли заявку на справку «Справка об обучении");
      expect(n.body).toMatch(/Срок готовности — /);
      expect(n.body).not.toMatch(/[{}]/);
    });

    it("смешанный выбор: шаг касается только заявок со «своим» статусом, остальные не трогаем", async () => {
      const submitted = await numberOf("stu-nikitina", "military", "SUBMITTED");
      const working = await numberOf("stu-fomin", "social", "IN_PROGRESS");
      const r = await requests.batchSetStatus(
        await irina(),
        {
          picks: [
            { number: submitted, from: "SUBMITTED" },
            { number: working, from: "IN_PROGRESS" },
          ],
          to: "ACCEPTED",
          template: "none",
        },
        new Date(),
      );
      expect(r).toEqual({ done: 1, stale: 0, skipped: 0, ignored: 1 });
      const w = await prisma.request.findUniqueOrThrow({
        where: { number: working },
        select: { status: true },
      });
      expect(w.status).toBe("IN_PROGRESS");
    });

    it("«Готова» пачкой создаёт справку с QR у каждой", async () => {
      const working = await prisma.request.findMany({
        where: { status: "IN_PROGRESS", studentId: { in: ["stu-zaitsev", "stu-nikitina"] } },
        select: { number: true },
      });
      expect(working).toHaveLength(2);
      const r = await requests.batchSetStatus(
        await irina(),
        {
          picks: working.map((w) => ({ number: w.number, from: "IN_PROGRESS" as const })),
          to: "READY",
          template: "ready-pickup",
        },
        new Date(),
      );
      expect(r.done).toBe(2);
      const docs = await prisma.issuedDocument.count({
        where: { request: { number: { in: working.map((w) => w.number) } } },
      });
      expect(docs).toBe(2);
    });
  });

  describe("база знаний из заявок", () => {
    it("черновик из ответа Ирины: имя убрано, повтор — та же запись", async () => {
      const number = await numberOf("stu-savelev", "embassy", "ISSUED");
      const ctx = await irina();
      const first = await faq.makeFaqDraft(ctx, number);
      if (typeof first === "string") throw new Error(first);
      expect(first.removed).toContain("name");
      const again = await faq.makeFaqDraft(ctx, number);
      expect(again).toEqual({ id: first.id, removed: [] });
      const e = await prisma.faqEntry.findUniqueOrThrow({ where: { id: first.id } });
      expect(e.body).not.toMatch(/Игор|Савель/);
      expect(e.published).toBe(false);
    });

    it("отказ: чужой факультет — not_found; только причина отказа — no_comment", async () => {
      const ctx = await irina();
      const other = { ...ctx, facultyIds: ["fac-4"] }; // МЖ
      const number = await numberOf("stu-savelev", "embassy", "ISSUED");
      expect(await faq.makeFaqDraft(other, number)).toBe("not_found");
      const timur = await numberOf(DEMO.timur.studentId, "military", "REJECTED");
      expect(await faq.makeFaqDraft(ctx, timur)).toBe("no_comment");
    });

    it("публикация: с именем студента — отказ; без — помощник отвечает с подписью", async () => {
      const ctx = await irina();
      const number = await numberOf("stu-savelev", "embassy", "ISSUED");
      const draft = await faq.makeFaqDraft(ctx, number);
      if (typeof draft === "string") throw new Error(draft);
      const form = {
        id: draft.id,
        title: "Нужен ли перевод справки для визы во Францию?",
        keywords: "перевод справки, виза, франция, консульство, французский",
        body: "Нет: консульству достаточно справки на английском. Перевод на французский деканат не делает.",
        intent: "publish" as const,
      };
      expect(
        await faq.saveFaqEntry(ctx, { ...form, body: `Игорь, ${form.body}` }, new Date()),
      ).toEqual({ personal: ["name"], field: "body" });
      expect(await repo.publishedAnswers((await loadStudentCtx(DEMO.alisa.userId))!)).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: draft.id })]),
      );

      expect(await faq.saveFaqEntry(ctx, form, new Date())).toBe("ok");
      const alisa = (await loadStudentCtx(DEMO.alisa.userId))!;
      const published = await repo.publishedAnswers(alisa);
      expect(published.map((p) => p.id)).toContain(draft.id);
      // Наружу — только текст и дата: без автора, факультета и заявки
      for (const p of published)
        expect(Object.keys(p).sort()).toEqual(["body", "id", "keywords", "publishedAt", "title"]);

      let text = "";
      for await (const ev of assistant.answer(
        alisa,
        [{ role: "user", content: "нужен ли перевод справки на французский для визы" }],
        new AbortController().signal,
        { provider: null },
      ))
        if (ev.t === "delta") text += ev.v;
      expect(text).toContain("**Нужен ли перевод справки для визы во Францию?**");
      expect(text).toMatch(/\*Ответ деканата от \d+ \p{L}+\*/u);
    });

    it("чужой факультет не видит, не правит и не удаляет запись", async () => {
      const ctx = await irina();
      const other = { ...ctx, facultyIds: ["fac-4"] };
      expect(await faq.getFaqEntry(other, "faq-typo")).toBeNull();
      expect(
        await faq.saveFaqEntry(
          other,
          {
            id: "faq-typo",
            title: "Подменённый вопрос для проверки",
            keywords: "x, y",
            body: "Подменённый ответ для проверки доступа.",
            intent: "save",
          },
          new Date(),
        ),
      ).toBe("not_found");
      expect(await faq.removeFaqEntry(other, "faq-typo")).toBe(false);
      const e = await prisma.faqEntry.findUniqueOrThrow({ where: { id: "faq-typo" } });
      expect(e.title).toMatch(/^Что делать, если в справке ошибка/);
    });
  });
});
