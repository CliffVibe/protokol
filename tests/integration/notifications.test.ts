// Уведомления, объявления и перенос пары (T09) на настоящем PostgreSQL с сидом.
// Изоляция студентов и факультетов (S1): чужое уведомление не отмечается, объявление МЭО не доходит до ФМО,
// пару чужого факультета не перенести. Только при TEST_DATABASE_URL (база пересеивается!).
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { matchesAudience } from "@/lib/audience";
import { addDays, mskAt, mskStartOfDay } from "@/lib/msk";
import { DEMO, SEED_PASSWORD_ENVS } from "../../prisma/seed-data";
import { runSeed } from "../../prisma/seed";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("уведомления, объявления, перенос в PostgreSQL", async () => {
  process.env.DATABASE_URL = url;
  const notifications = await import("@/server/repos/notifications");
  const ann = await import("@/server/repos/staff-announcements");
  const sched = await import("@/server/repos/staff-schedule");
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

  describe("уведомления студента", () => {
    it("непрочитанные считаются только свои; чужое уведомление не отмечается", async () => {
      const alisa = await student(DEMO.alisa.userId);
      const timur = await student(DEMO.timur.userId);
      const own = await prisma.notification.count({
        where: { studentId: DEMO.alisa.studentId, readAt: null },
      });
      expect(own).toBeGreaterThan(0);
      expect(await notifications.unreadCountOf(alisa)).toBe(own);

      const timurs = await prisma.notification.findFirstOrThrow({
        where: { studentId: DEMO.timur.studentId, readAt: null },
        select: { id: true },
      });
      expect(await notifications.markRead(alisa, timurs.id)).toBeNull();
      const after = await prisma.notification.findUniqueOrThrow({
        where: { id: timurs.id },
        select: { readAt: true },
      });
      expect(after.readAt).toBeNull();

      // Положительный контроль: своё Тимур отмечает
      expect(await notifications.markRead(timur, timurs.id)).not.toBeNull();
      expect(
        (await prisma.notification.findUniqueOrThrow({ where: { id: timurs.id } })).readAt,
      ).not.toBeNull();
    });

    it("«Отметить прочитанными» с видом — только этот вид", async () => {
      const timur = await student(DEMO.timur.userId);
      const before = await notifications.unreadByKind(timur);
      expect(before.DEADLINE ?? 0).toBeGreaterThan(0);
      await notifications.markAllRead(timur, "DEADLINE");
      const after = await notifications.unreadByKind(timur);
      expect(after.DEADLINE ?? 0).toBe(0);
      expect(after.ANNOUNCEMENT ?? 0).toBe(before.ANNOUNCEMENT ?? 0);
    });

    it("«Отметить всё» трогает только свои", async () => {
      const alisa = await student(DEMO.alisa.userId);
      const timurUnread = await prisma.notification.count({
        where: { studentId: DEMO.timur.studentId, readAt: null },
      });
      await notifications.markAllRead(alisa);
      expect(await notifications.unreadCountOf(alisa)).toBe(0);
      expect(
        await prisma.notification.count({
          where: { studentId: DEMO.timur.studentId, readAt: null },
        }),
      ).toBe(timurUnread);
    });

    it("фильтр по виду и числа по видам", async () => {
      const timur = await student(DEMO.timur.userId);
      const req = await notifications.notificationsOf(timur, "REQUEST_STATUS");
      expect(req.length).toBeGreaterThan(0);
      expect(req.every((n) => n.kind === "REQUEST_STATUS")).toBe(true);
      const byKind = await notifications.unreadByKind(timur);
      const total = Object.values(byKind).reduce((a, b) => a + (b ?? 0), 0);
      expect(total).toBe(await notifications.unreadCountOf(timur));
    });
  });

  describe("объявления сотрудника", () => {
    it("объявление для МЭО: уведомление у Тимура, у Алисы — нет (приёмка T09)", async () => {
      const ctx = await irina();
      const r = await ann.publishAnnouncement(ctx, {
        title: "Только МЭО — интеграционный тест",
        body: "**Текст**",
        audience: { facultyCodes: ["МЭО"] },
        pinned: false,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const got = await prisma.notification.findMany({
        where: { title: "Только МЭО — интеграционный тест" },
        select: { studentId: true, body: true, link: true, kind: true },
      });
      const ids = got.map((g) => g.studentId);
      expect(ids).toContain(DEMO.timur.studentId);
      expect(ids).not.toContain(DEMO.alisa.studentId);
      expect(got.length).toBe(r.recipients);
      expect(got[0]).toMatchObject({
        kind: "ANNOUNCEMENT",
        body: "Текст",
        link: `/notifications?tab=announcements#announcement-${r.id}`,
      });
    });

    it("адресаты запросом = matchesAudience на всех студентах (тот же смысл, что у доски)", async () => {
      const ctx = await irina();
      const students = await prisma.student.findMany({
        select: {
          id: true,
          group: {
            select: {
              name: true,
              course: true,
              program: { select: { faculty: { select: { code: true } }, facultyId: true } },
            },
          },
        },
      });
      for (const audience of [
        { facultyCodes: ["ФМО", "МЭО"] },
        { facultyCodes: ["ФМО"], courses: [2] },
        { facultyCodes: ["ФМО", "МЭО"], groupNames: ["2МО-3", "4МЭО-1"] },
        { facultyCodes: ["МЭО"], courses: [1] },
      ]) {
        const expected = students.filter(
          (s) =>
            ctx.facultyIds.includes(s.group.program.facultyId) &&
            matchesAudience(audience, {
              facultyCode: s.group.program.faculty.code,
              course: s.group.course,
              groupName: s.group.name,
            }),
        ).length;
        expect(await ann.countRecipients(ctx, audience), JSON.stringify(audience)).toBe(expected);
      }
    });

    it("audience с чужим факультетом всё равно не доходит до чужих студентов", async () => {
      const ctx = await irina();
      // buildAudience такое не пропустит; проверяем второй рубеж — фильтр по facultyIds в репозитории
      const r = await ann.publishAnnouncement(ctx, {
        title: "Попытка в МЖ — интеграционный тест",
        body: "x",
        audience: { facultyCodes: ["МЖ", "ФМО"] },
        pinned: false,
      });
      expect(r.ok).toBe(true);
      const got = await prisma.notification.findMany({
        where: { title: "Попытка в МЖ — интеграционный тест" },
        select: {
          student: {
            select: {
              group: { select: { program: { select: { faculty: { select: { code: true } } } } } },
            },
          },
        },
      });
      expect(got.length).toBeGreaterThan(0);
      expect(got.every((g) => g.student.group.program.faculty.code === "ФМО")).toBe(true);
    });

    it("никому — не публикуем", async () => {
      const ctx = await irina();
      const r = await ann.publishAnnouncement(ctx, {
        title: "Пустота",
        body: "x",
        audience: { facultyCodes: ["МЖ"] },
        pinned: false,
      });
      expect(r).toEqual({ ok: false, reason: "empty" });
      expect(await prisma.announcement.count({ where: { title: "Пустота" } })).toBe(0);
    });

    it("закрепить можно только своё", async () => {
      const ctx = await irina();
      const mine = await ann.myAnnouncements(ctx);
      expect(mine.length).toBeGreaterThan(0);
      expect(await ann.setPinned(ctx, mine[0]!.id, true)).toBe(true);
      expect(await ann.setPinned({ ...ctx, staffId: "stf-nobody" }, mine[0]!.id, false)).toBe(
        false,
      );
      expect(
        (await prisma.announcement.findUniqueOrThrow({ where: { id: mine[0]!.id } })).pinned,
      ).toBe(true);
    });
  });

  describe("перенос пары", () => {
    const futureLesson = async (groupName: string) =>
      prisma.lesson.findFirstOrThrow({
        where: {
          group: { name: groupName },
          change: "NONE",
          startsAt: { gte: new Date(Date.now() + 2 * 60 * 60 * 1000) },
        },
        orderBy: { startsAt: "asc" },
        select: { id: true, startsAt: true, endsAt: true, room: true, groupId: true },
      });
    const target = (days: number, time: string) =>
      mskAt(addDays(mskStartOfDay(new Date()), days), time);

    it("перенос: время, длительность, «было», уведомление каждому в группе", async () => {
      const ctx = await irina();
      const l = await futureLesson("2МО-3");
      const to = target(3, "18:00");
      const r = await sched.rescheduleLesson(ctx, {
        lessonId: l.id,
        expectedStartsAt: l.startsAt,
        startsAt: to,
        room: "512",
        reason: "Преподаватель на конференции",
      });
      const groupSize = await prisma.student.count({ where: { groupId: l.groupId! } });
      expect(r).toEqual({ result: "ok", recipients: groupSize });
      const saved = await prisma.lesson.findUniqueOrThrow({ where: { id: l.id } });
      expect(saved).toMatchObject({
        startsAt: to,
        room: "512",
        change: "MOVED",
        changeNote: "Преподаватель на конференции",
        originalStartsAt: l.startsAt,
      });
      expect(+saved.endsAt - +saved.startsAt).toBe(+l.endsAt - +l.startsAt);
      const sent = await prisma.notification.findMany({
        where: {
          kind: "SCHEDULE_CHANGE",
          link: { startsWith: "/schedule?day=" },
          createdAt: { gte: new Date(Date.now() - 60_000) },
        },
        select: { studentId: true },
      });
      expect(sent.map((s) => s.studentId)).toContain(DEMO.alisa.studentId);
      expect(sent.map((s) => s.studentId)).not.toContain(DEMO.timur.studentId);

      // Повторный перенос — «было» остаётся первым исходным временем
      const again = await sched.rescheduleLesson(ctx, {
        lessonId: l.id,
        expectedStartsAt: to,
        startsAt: target(4, "10:10"),
        room: null,
        reason: "Ещё раз",
      });
      expect(again.result).toBe("ok");
      const twice = await prisma.lesson.findUniqueOrThrow({ where: { id: l.id } });
      expect(twice.originalStartsAt).toEqual(l.startsAt);
      expect(twice.room).toBe("512");
    });

    it("два сотрудника разом — второй получает conflict; устаревшее время — conflict", async () => {
      const ctx = await irina();
      const l = await futureLesson("2МО-1");
      const move = (time: string) =>
        sched.rescheduleLesson(ctx, {
          lessonId: l.id,
          expectedStartsAt: l.startsAt,
          startsAt: target(5, time),
          room: null,
          reason: "Гонка двух сотрудников",
        });
      const results = await Promise.all([move("12:00"), move("14:00")]);
      expect(results.map((r) => r.result).sort()).toEqual(["conflict", "ok"]);
    });

    it("пара чужого факультета — not_found, ничего не меняется", async () => {
      const ctx = await irina();
      const foreign = await prisma.lesson.findFirstOrThrow({
        where: {
          group: { program: { faculty: { code: "МЖ" } } },
          startsAt: { gte: new Date(Date.now() + 2 * 60 * 60 * 1000) },
        },
        select: { id: true, startsAt: true },
      });
      expect(
        await sched.rescheduleLesson(ctx, {
          lessonId: foreign.id,
          expectedStartsAt: foreign.startsAt,
          startsAt: target(3, "18:00"),
          room: null,
          reason: "Чужая пара",
        }),
      ).toEqual({ result: "not_found" });
      expect(
        (await prisma.lesson.findUniqueOrThrow({ where: { id: foreign.id } })).startsAt,
      ).toEqual(foreign.startsAt);
      // и в списке пар сотрудника чужой группы нет
      const groups = await sched.groupsForStaff(ctx);
      expect(groups.some((g) => g.program.faculty.code === "МЖ")).toBe(false);
    });
  });
});
