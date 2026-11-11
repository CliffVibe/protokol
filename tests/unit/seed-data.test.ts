import { describe, expect, it } from "vitest";
import { buildSeed, DEMO } from "../../prisma/seed-data";
import { addDays, mskDateKey, mskStartOfDay, mskStartOfWeek } from "@/lib/msk";
import { relativeLinkSchema } from "@/lib/links";

// Среда, суббота и воскресенье — сид должен давать живое демо в любой день (06-seed-data.md)
const DATES = {
  wednesday: new Date("2026-11-04T09:30:00+03:00"),
  // Пятница: «завтра» и «послезавтра» у 4МЭО-1 может не быть пар (T06)
  friday: new Date("2026-11-06T09:30:00+03:00"),
  saturday: new Date("2026-11-07T09:30:00+03:00"),
  sunday: new Date("2026-11-08T09:30:00+03:00"),
  lateNight: new Date("2026-11-05T04:00:00+03:00"), // время ночного cron
};

const ALISA_LG = ["lg-en-b2-4", "lg-fr-a2-1"];
const alisaLessons = (data: ReturnType<typeof buildSeed>) =>
  data.lessons.filter(
    (l) => l.groupId === "grp-2mo3" || ALISA_LG.includes(l.languageGroupId ?? ""),
  );
const sameDay = (d: Date | string, day: Date) => mskDateKey(new Date(d)) === mskDateKey(day);

describe("buildSeed", () => {
  it("детерминирован при фиксированной дате", () => {
    expect(buildSeed(DATES.wednesday)).toEqual(buildSeed(DATES.wednesday));
  });

  it("в данных нет паролей и секретов — только имена переменных", () => {
    const json = JSON.stringify(buildSeed(DATES.wednesday));
    expect(json).not.toMatch(/passwordHash|calendarToken|verifyToken/);
    for (const u of buildSeed(DATES.wednesday).users) {
      expect(u.passwordEnv === null || /^SEED_PASSWORD_[A-Z]+$/.test(u.passwordEnv)).toBe(true);
    }
  });

  it("объёмы как в 06-seed-data.md", () => {
    const d = buildSeed(DATES.wednesday);
    expect(d.faculties).toHaveLength(8);
    expect(d.groups.length).toBeGreaterThanOrEqual(10);
    expect(d.disciplines.length).toBeGreaterThanOrEqual(15);
    expect(d.teachers.length).toBeGreaterThanOrEqual(12);
    // T14: + «Заявление на повышенную стипендию» (предлагает деканат) и объявление «Вы сказали — мы сделали»
    expect(d.requestTypes).toHaveLength(10);
    expect(d.announcements).toHaveLength(7);
    expect(d.announcements.filter((a) => "youSaid" in a && a.youSaid)).toHaveLength(1);
    expect(d.announcements.filter((a) => a.pinned)).toHaveLength(2);
    expect(d.deadlines).toHaveLength(4);
    const nearest = [...d.deadlines].sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt))[0]!;
    expect(sameDay(nearest.dueAt, addDays(mskStartOfDay(DATES.wednesday), 2))).toBe(true);
    for (const t of d.requestTypes) {
      expect((t.purposeTags as string[]).length).toBeGreaterThan(0);
      expect(t.slaDays).toBeGreaterThan(0);
    }
  });

  it("id уникальны во всех таблицах", () => {
    const d = buildSeed(DATES.wednesday);
    for (const rows of [
      d.lessons,
      d.grades,
      d.requests,
      d.requestEvents,
      d.notifications,
      d.users,
      d.students,
    ]) {
      const ids = rows.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  for (const [name, now] of Object.entries(DATES)) {
    describe(`день: ${name}`, () => {
      const d = buildSeed(now);
      const today = mskStartOfDay(now);
      const weekStart = mskStartOfWeek(today);
      const weekEnd = addDays(weekStart, 7);

      it("у Алисы сегодня есть пары и ровно 1 перенос", () => {
        const todays = alisaLessons(d).filter((l) => sameDay(l.startsAt, today));
        expect(todays.length).toBeGreaterThanOrEqual(2);
        expect(todays.filter((l) => l.change === "MOVED")).toHaveLength(1);
        const moved = todays.find((l) => l.change === "MOVED")!;
        expect(moved.originalStartsAt).toBeTruthy();
        expect(moved.changeNote).toBeTruthy();
      });

      it("у Алисы за неделю 2 переноса и 1 отмена", () => {
        const week = alisaLessons(d).filter(
          (l) => +new Date(l.startsAt) >= +weekStart && +new Date(l.startsAt) < +weekEnd,
        );
        expect(week.filter((l) => l.change === "MOVED")).toHaveLength(2);
        expect(week.filter((l) => l.change === "CANCELLED")).toHaveLength(1);
      });

      it("пары Алисы не пересекаются по времени", () => {
        const active = alisaLessons(d).filter((l) => l.change !== "CANCELLED");
        const byStart = active.map((l) => +new Date(l.startsAt));
        expect(new Set(byStart).size).toBe(byStart.length);
      });

      it("у Тимура долг, экзамен через 3 дня и отклонённая заявка", () => {
        const g = d.grades.filter((x) => x.studentId === DEMO.timur.studentId);
        expect(g.some((x) => x.finalMark === 2)).toBe(true);
        const exam = d.lessons.find((l) => l.groupId === "grp-4meo1" && l.kind === "EXAM");
        expect(exam && sameDay(exam.startsAt, addDays(today, 3))).toBe(true);
        expect(g.some((x) => x.examDate && sameDay(x.examDate, addDays(today, 3)))).toBe(true);
        const r = d.requests.filter((x) => x.studentId === DEMO.timur.studentId);
        expect(r.map((x) => x.status)).toContain("REJECTED");
      });

      it("для расписания (T06): смена аудитории у Тимура в ближайшие дни, переход в Одинцово у Алисы", () => {
        const roomChanged = d.lessons.filter(
          (l) => l.groupId === "grp-4meo1" && l.change === "ROOM_CHANGED",
        );
        expect(roomChanged).toHaveLength(1);
        const at = +new Date(roomChanged[0]!.startsAt);
        expect(at).toBeGreaterThanOrEqual(+addDays(today, 1));
        expect(at).toBeLessThan(+addDays(today, 8));
        const thisWeekOdintsovo = alisaLessons(d).filter(
          (l) =>
            l.building === "Одинцово" &&
            +new Date(l.startsAt) >= +weekStart &&
            +new Date(l.startsAt) < +weekEnd,
        );
        expect(thisWeekOdintsovo.length).toBeGreaterThan(0);
      });

      it("пары Тимура (группа и язык) не пересекаются, в том числе с экзаменом", () => {
        const timur = d.lessons
          .filter(
            (l) =>
              (l.groupId === "grp-4meo1" || l.languageGroupId === "lg-en-c1-2") &&
              l.change !== "CANCELLED",
          )
          .map((l) => [+new Date(l.startsAt), +new Date(l.endsAt)] as const)
          .sort((a, b) => a[0] - b[0]);
        for (let i = 1; i < timur.length; i++)
          expect(timur[i]![0]).toBeGreaterThanOrEqual(timur[i - 1]![1]);
      });

      it("у Алисы 2 заявки, одна «Готова» — с документом для QR", () => {
        const r = d.requests.filter((x) => x.studentId === DEMO.alisa.studentId);
        expect(r).toHaveLength(2);
        const ready = r.find((x) => x.status === "READY");
        expect(ready).toBeTruthy();
        expect(d.issuedDocuments.some((doc) => doc.requestId === ready!.id)).toBe(true);
      });

      it("T14: оценки — только у закрытых заявок фоновых студентов ФМО и МЭО, в диапазоне 1–5", () => {
        const rated = d.requests.filter((x) => x.rating != null);
        expect(rated.length).toBeGreaterThanOrEqual(4);
        const demo = [DEMO.alisa.studentId, DEMO.timur.studentId, DEMO.vera.studentId];
        for (const r of rated) {
          expect(r.status).toBe("ISSUED");
          expect(demo).not.toContain(r.studentId);
          expect(r.rating).toBeGreaterThanOrEqual(1);
          expect(r.rating).toBeLessThanOrEqual(5);
          expect(+new Date(r.ratedAt!)).toBeLessThanOrEqual(+now);
        }
        // Есть хотя бы одна низкая оценка с комментарием — повод для «Вы сказали — мы сделали»
        expect(rated.some((r) => r.rating! <= 2 && r.ratingComment)).toBe(true);
      });

      it("у Веры нет заявок, оценок и уведомлений — для пустых состояний", () => {
        const id = DEMO.vera.studentId;
        expect(d.requests.filter((x) => x.studentId === id)).toHaveLength(0);
        expect(d.grades.filter((x) => x.studentId === id)).toHaveLength(0);
        expect(d.notifications.filter((x) => x.studentId === id)).toHaveLength(0);
      });

      it("ничего не датировано будущим, кроме расписания и дедлайнов", () => {
        for (const x of d.requestEvents) expect(+new Date(x.createdAt!)).toBeLessThanOrEqual(+now);
        for (const x of d.notifications) expect(+new Date(x.createdAt!)).toBeLessThanOrEqual(+now);
        for (const x of d.announcements) expect(+new Date(x.publishedAt)).toBeLessThanOrEqual(+now);
      });
    });
  }

  it("номера заявок — «С-ГГГГ-NNNNN» с кириллической С", () => {
    for (const r of buildSeed(DATES.wednesday).requests)
      expect(r.number).toMatch(/^С-\d{4}-\d{5}$/);
  });

  it("ссылки уведомлений и дедлайнов — только пути внутри сайта (T09: та же схема, что при записи)", () => {
    const d = buildSeed(DATES.wednesday);
    for (const x of [...d.notifications, ...d.deadlines])
      if (x.link) expect(relativeLinkSchema.safeParse(x.link).success, x.link).toBe(true);
  });

  it("Ирина — сотрудник ФМО и МЭО", () => {
    const d = buildSeed(DATES.wednesday);
    const codes = (d.staff[0]!.facultyIds as string[]).map(
      (id) => d.faculties.find((f) => f.id === id)?.code,
    );
    expect(codes).toEqual(["ФМО", "МЭО"]);
  });
});
