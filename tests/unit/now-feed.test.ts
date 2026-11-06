// Главная «Сейчас» (T05): правило стипендии, адресаты объявлений, выбор пары, человеческие даты.
import { describe, expect, it } from "vitest";
import { matchesAudience } from "@/lib/audience";
import { formatCountdown, formatRelativeDay, greetingFor } from "@/lib/dates";
import { summarizeStudy, type GradeRow } from "@/server/services/academics";
import { pickChanges, pickNext, sortRequests } from "@/server/services/now";
import type { LessonRow } from "@/server/repos/schedule";
import type { RequestRow } from "@/server/repos/requests";

const msk = (iso: string) => new Date(`${iso}+03:00`);

// ── Стипендия ────────────────────────────────────────────────────────────

const g = (semester: number, name: string, over: Partial<GradeRow> = {}): GradeRow => ({
  semester,
  kind: "EXAM",
  ratingPoints: null,
  finalMark: null,
  passed: null,
  examDate: null,
  discipline: { id: name, name },
  ...over,
});

describe("summarizeStudy — вымышленное правило стипендии", () => {
  it("как у Алисы: нет долгов, прошлая сессия на 4–5, текущий рейтинг ≥ 60 → сохраняется", () => {
    const s = summarizeStudy([
      g(2, "История", { finalMark: 4, ratingPoints: 78 }),
      g(2, "Право", { finalMark: 5, ratingPoints: 88 }),
      g(3, "ТМО", { ratingPoints: 82 }),
      g(3, "Протокол", { kind: "CREDIT", ratingPoints: 90 }),
    ]);
    expect(s).toEqual({ semester: 3, averageRating: 86, debts: 0, scholarship: { kept: true } });
  });

  it("как у Тимура: долг в прошлой сессии и 54/100 сейчас → под угрозой с причинами", () => {
    const s = summarizeStudy([
      g(6, "Эконометрика", { finalMark: 2, ratingPoints: 38 }),
      g(6, "Мировая экономика", { finalMark: 4, ratingPoints: 71 }),
      g(7, "Мировая экономика", { ratingPoints: 61 }),
      g(7, "Финансы", { ratingPoints: 54 }),
    ]);
    expect(s?.debts).toBe(1);
    expect(s?.scholarship).toEqual({
      kept: false,
      reasons: ["Долг: Эконометрика", "Финансы: 54/100"],
    });
  });

  it("граница: 60 — ещё сохраняется, 59 — уже нет", () => {
    expect(summarizeStudy([g(1, "A", { ratingPoints: 60 })])?.scholarship).toEqual({ kept: true });
    expect(summarizeStudy([g(1, "A", { ratingPoints: 59 })])?.scholarship.kept).toBe(false);
  });

  it("тройка в прошлой сессии и «не зачтено» — причины", () => {
    const s = summarizeStudy([
      g(1, "Логика", { finalMark: 3 }),
      g(1, "Физкультура", { kind: "CREDIT", passed: false }),
      g(2, "A", { ratingPoints: 90 }),
    ]);
    expect(s?.scholarship).toEqual({
      kept: false,
      reasons: ["Долг: Физкультура", "Оценка 3 в прошлой сессии: Логика"],
    });
  });

  it("как у Веры: оценок нет → сводки нет (а не «сохраняется»)", () => {
    expect(summarizeStudy([])).toBeNull();
  });
});

// ── Адресаты ─────────────────────────────────────────────────────────────

describe("matchesAudience", () => {
  const alisa = { facultyCode: "ФМО", course: 2, groupName: "2МО-3" };
  it("пустой объект — всем", () => expect(matchesAudience({}, alisa)).toBe(true));
  it("все указанные условия должны совпасть", () => {
    expect(matchesAudience({ facultyCodes: ["ФМО", "МЭО"] }, alisa)).toBe(true);
    expect(matchesAudience({ facultyCodes: ["МЭО"] }, alisa)).toBe(false);
    expect(matchesAudience({ facultyCodes: ["ФМО"], courses: [1] }, alisa)).toBe(false);
    expect(matchesAudience({ groupNames: ["2МО-3", "2МО-1"] }, alisa)).toBe(true);
  });
  it("неизвестный ключ (опечатка) — никому, а не «всем»", () => {
    expect(matchesAudience({ facultyCode: "МЭО" }, alisa)).toBe(false);
    expect(matchesAudience({ faculties: ["ФМО"] }, alisa)).toBe(false);
  });
  it("битый JSON — никому", () => {
    expect(matchesAudience(null, alisa)).toBe(false);
    expect(matchesAudience("всем", alisa)).toBe(false);
    expect(matchesAudience({ courses: ["2"] }, alisa)).toBe(false);
  });
});

// ── Выбор пары ───────────────────────────────────────────────────────────

const lesson = (start: string, end: string, over: Partial<LessonRow> = {}): LessonRow => ({
  id: start,
  kind: "SEMINAR",
  startsAt: msk(start),
  endsAt: msk(end),
  building: "Главный",
  room: "101",
  change: "NONE",
  changeNote: null,
  originalStartsAt: null,
  discipline: { name: "ТМО" },
  teacher: { fullName: "Иванова И. И." },
  languageGroup: null,
  ...over,
});

describe("pickNext", () => {
  const day = [
    lesson("2026-11-06T09:30", "2026-11-06T10:50"),
    lesson("2026-11-06T11:10", "2026-11-06T12:30", { change: "CANCELLED" }),
    lesson("2026-11-06T13:00", "2026-11-06T14:20"),
    lesson("2026-11-09T09:30", "2026-11-09T10:50"),
  ];
  it("до пар — ближайшая", () => {
    expect(pickNext(day, msk("2026-11-06T08:00"))).toMatchObject({
      state: "upcoming",
      lesson: { id: "2026-11-06T09:30" },
    });
  });
  it("во время пары — она, «идёт»", () => {
    expect(pickNext(day, msk("2026-11-06T10:00"))?.state).toBe("ongoing");
  });
  it("отменённая не бывает следующей", () => {
    expect(pickNext(day, msk("2026-11-06T11:00"))?.lesson.id).toBe("2026-11-06T13:00");
  });
  it("всё прошло — первая пара следующего учебного дня (через выходные)", () => {
    expect(pickNext(day, msk("2026-11-06T18:00"))?.lesson.id).toBe("2026-11-09T09:30");
  });
  it("пар нет — null", () => expect(pickNext([], msk("2026-11-06T08:00"))).toBeNull());
});

describe("pickChanges", () => {
  it("изменения сегодня и завтра, не дальше", () => {
    const rows = [
      lesson("2026-11-06T09:30", "2026-11-06T10:50", { change: "MOVED" }),
      lesson("2026-11-07T09:30", "2026-11-07T10:50", { change: "ROOM_CHANGED" }),
      lesson("2026-11-08T09:30", "2026-11-08T10:50", { change: "CANCELLED" }),
      lesson("2026-11-06T13:00", "2026-11-06T14:20"),
    ];
    expect(pickChanges(rows, msk("2026-11-06T08:00")).map((l) => l.id)).toEqual([
      "2026-11-06T09:30",
      "2026-11-07T09:30",
    ]);
  });
});

describe("sortRequests", () => {
  const r = (number: string, status: RequestRow["status"], updated: string): RequestRow => ({
    number,
    status,
    createdAt: msk("2026-11-01T10:00"),
    updatedAt: msk(updated),
    type: { title: "Справка", slaDays: 3 },
  });
  it("«Готова» первой, дальше — свежие; срок = создана + slaDays", () => {
    const sorted = sortRequests([
      r("1", "IN_PROGRESS", "2026-11-05T10:00"),
      r("2", "READY", "2026-11-03T10:00"),
      r("3", "SUBMITTED", "2026-11-06T10:00"),
    ]);
    expect(sorted.map((x) => x.number)).toEqual(["2", "3", "1"]);
    expect(sorted[0]!.dueAt).toEqual(msk("2026-11-04T10:00"));
  });
});

// ── Даты ─────────────────────────────────────────────────────────────────

describe("человеческие даты", () => {
  it("приветствие по московскому часу", () => {
    expect(greetingFor(msk("2026-11-06T04:00"))).toBe("Доброй ночи");
    expect(greetingFor(msk("2026-11-06T05:00"))).toBe("Доброе утро");
    expect(greetingFor(msk("2026-11-06T11:59"))).toBe("Доброе утро");
    expect(greetingFor(msk("2026-11-06T12:00"))).toBe("Добрый день");
    expect(greetingFor(msk("2026-11-06T18:00"))).toBe("Добрый вечер");
    expect(greetingFor(msk("2026-11-06T23:00"))).toBe("Доброй ночи");
  });
  it("сегодня / завтра / дата — по московским суткам, не по UTC", () => {
    const now = msk("2026-11-06T23:30"); // в UTC это ещё 20:30
    expect(formatRelativeDay(msk("2026-11-06T09:00"), now)).toBe("сегодня");
    expect(formatRelativeDay(msk("2026-11-07T01:00"), now)).toBe("завтра");
    expect(formatRelativeDay(msk("2026-11-09T09:00"), now)).toMatch(/пн.*9 нояб/);
  });
  it("обратный отсчёт", () => {
    const s = msk("2026-11-06T10:00");
    const e = msk("2026-11-06T11:20");
    expect(formatCountdown(s, e, msk("2026-11-06T09:35"))).toBe("через 25 мин");
    expect(formatCountdown(s, e, msk("2026-11-06T07:50"))).toBe("через 2 ч 10 мин");
    expect(formatCountdown(s, e, msk("2026-11-06T08:00"))).toBe("через 2 ч");
    expect(formatCountdown(s, e, msk("2026-11-06T10:40"))).toBe("идёт, до конца 40 мин");
  });
});
