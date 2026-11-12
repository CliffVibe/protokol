// T14: идеи из ресерча — «Вам положено» (J), оценка заявки (K) и подбор свободной аудитории (N; у студента
// снято 11.11 — аудитории закрыты, ключи студентам не дают; осталось сотруднику при переносе пары). Чистые функции.
import { describe, expect, it } from "vitest";
import type { StudySummary } from "@/server/services/academics";
import {
  deadlineRelevant,
  offersFor as offersForSubject,
  semesterOf,
  SCHOLARSHIP_UP_MIN_SESSIONS,
} from "@/server/services/offer-rules";
import {
  isRatable,
  ratingCommentSchema,
  ratingSchema,
  summarizeRatings,
} from "@/server/services/request-rules";
import { freeRoomsIn, nearestRooms } from "@/server/services/schedule";

const study = (over: Partial<StudySummary> = {}): StudySummary => ({
  semester: 3,
  averageRating: 82,
  debts: 0,
  scholarship: { kept: true },
  excellentSessions: 2,
  firstDebt: null,
  ...over,
});
const none = new Set<string>();
// Студент 2-го курса (как Алиса); у правила первокурсника — свой тест ниже
const offersFor = (s: StudySummary | null, taken: Set<string>, dismissed: Set<string>) =>
  offersForSubject({ study: s, course: 2 }, taken, dismissed);

describe("J. «Вам положено»: повышенная стипендия за учёбу — только «отлично» две сессии подряд", () => {
  it("подходит: две сессии на «отлично», долгов нет, стипендия сохраняется — с объяснением", () => {
    const [o] = offersFor(study(), none, none);
    expect(o?.code).toBe("scholarship_up");
    expect(o?.typeCode).toBe("scholarship_up");
    expect(o?.why).toContain("2 сессии подряд только на «отлично»");
    expect(o?.why).toContain("стипендиальная комиссия");
  });

  it("не подходит: одна сессия на «отлично», есть долг, стипендия под угрозой, нет оценок", () => {
    expect(
      offersFor(study({ excellentSessions: SCHOLARSHIP_UP_MIN_SESSIONS - 1 }), none, none),
    ).toEqual([]);
    expect(offersFor(study({ debts: 1 }), none, none)).toEqual([]);
    expect(
      offersFor(
        study({ scholarship: { kept: false, lost: false, reasons: ["рейтинг"] } }),
        none,
        none,
      ),
    ).toEqual([]);
    expect(offersFor(null, none, none)).toEqual([]);
  });

  it("три сессии подряд — тоже подходит, число в объяснении", () => {
    expect(offersFor(study({ excellentSessions: 3 }), none, none)[0]?.why).toContain(
      "3 сессии подряд",
    );
  });

  it("не предлагаем повторно: заявление уже подано или «Не сейчас» в этом семестре", () => {
    expect(offersFor(study(), new Set(["scholarship_up"]), none)).toEqual([]);
    expect(offersFor(study(), none, new Set(["scholarship_up"]))).toEqual([]);
  });
});

describe("J. «Деканат предлагает»: пересдача и справка первокурснику (оценка «глазами жюри», 12.11)", () => {
  const debt = (retakeAt: Date | null) =>
    study({
      debts: 1,
      scholarship: { kept: false, lost: true, reasons: ["долг"] },
      excellentSessions: 0,
      firstDebt: { discipline: "Эконометрика", retakeAt },
    });

  it("долг с назначенной пересдачей → заявление заполнено дисциплиной; стипендию не предлагаем", () => {
    const offers = offersFor(debt(new Date("2026-11-16T07:00:00Z")), none, none);
    expect(offers.map((o) => o.code)).toEqual(["retake"]);
    expect(offers[0]).toMatchObject({
      typeCode: "retake",
      headline: "Заявление на пересдачу: Эконометрика",
      payload: { discipline: "Эконометрика" },
    });
    expect(offers[0]?.why).toContain("Пересдача назначена на 16 ноября");
  });

  it("долг без даты — тоже предлагаем, но без обещания даты; заявление уже подано — нет", () => {
    expect(offersFor(debt(null), none, none)[0]?.why).toContain("пока без даты");
    expect(offersFor(debt(null), new Set(["retake"]), none)).toEqual([]);
  });

  it("первокурсник без оценок → справка «по месту требования»; второй курс и уже заказанная — нет", () => {
    const [o] = offersForSubject({ study: null, course: 1 }, none, none);
    expect(o).toMatchObject({
      code: "first_year_study",
      typeCode: "study_ru",
      action: "Заказать справку",
      payload: { addressee: "По месту требования" },
    });
    expect(offersForSubject({ study: null, course: 2 }, none, none)).toEqual([]);
    expect(offersForSubject({ study: null, course: 1 }, new Set(["study_ru"]), none)).toEqual([]);
    expect(
      offersForSubject({ study: null, course: 1 }, none, new Set(["first_year_study"])),
    ).toEqual([]);
  });

  it("семестр для «Не сейчас»: по оценкам, а без них — по курсу и месяцу", () => {
    const nov = new Date("2026-11-12T12:00:00Z");
    const mar = new Date("2027-03-01T12:00:00Z");
    expect(semesterOf({ study: study({ semester: 3 }), course: 2 }, nov)).toBe(3);
    expect(semesterOf({ study: null, course: 1 }, nov)).toBe(1);
    expect(semesterOf({ study: null, course: 1 }, mar)).toBe(2);
    expect(semesterOf({ study: null, course: null }, nov)).toBeNull();
  });

  it("дедлайн повышенной стипендии — только тем, кто подходит; дедлайн без правила — всем", () => {
    const link = "/requests/new?type=scholarship_up";
    expect(deadlineRelevant(link, { study: study(), course: 2 })).toBe(true);
    expect(deadlineRelevant(link, { study: debt(null), course: 4 })).toBe(false);
    expect(deadlineRelevant(link, { study: null, course: 1 })).toBe(false);
    expect(deadlineRelevant(null, { study: debt(null), course: 4 })).toBe(true);
    expect(deadlineRelevant("/requests/new", { study: debt(null), course: 4 })).toBe(true);
  });
});

describe("K. Оценка решения заявки", () => {
  it("оценить можно только «Готова» и «Выдана»", () => {
    expect(isRatable("READY")).toBe(true);
    expect(isRatable("ISSUED")).toBe(true);
    for (const s of ["SUBMITTED", "ACCEPTED", "IN_PROGRESS", "REJECTED", "CANCELLED"] as const)
      expect(isRatable(s)).toBe(false);
  });

  it("оценка — целое 1–5, комментарий до 300 символов, пустой → null", () => {
    expect(ratingSchema.parse("5")).toBe(5);
    for (const bad of ["0", "6", "3.5", "", "пять", null])
      expect(ratingSchema.safeParse(bad).success).toBe(false);
    expect(ratingCommentSchema.parse("  ")).toBeNull();
    expect(ratingCommentSchema.safeParse("а".repeat(301)).success).toBe(false);
  });

  it("сводка: средняя по всем и по типам (хуже — выше), последние отзывы с комментарием", () => {
    const t = (code: string, title: string) => ({ code, title });
    const rows = [
      {
        rating: 2,
        ratingComment: "Долго",
        ratedAt: new Date("2026-11-10"),
        type: t("en", "На английском"),
      },
      {
        rating: 5,
        ratingComment: null,
        ratedAt: new Date("2026-11-09"),
        type: t("ru", "Об обучении"),
      },
      {
        rating: 4,
        ratingComment: "Ок",
        ratedAt: new Date("2026-11-08"),
        type: t("ru", "Об обучении"),
      },
      { rating: null, ratingComment: null, ratedAt: null, type: t("ru", "Об обучении") },
    ];
    const s = summarizeRatings(rows);
    expect(s.count).toBe(3);
    expect(s.average).toBe(3.7);
    expect(s.byType.map((x) => [x.code, x.average, x.count])).toEqual([
      ["en", 2, 1],
      ["ru", 4.5, 2],
    ]);
    // Сначала низкие оценки
    expect(s.recent.map((r) => r.comment)).toEqual(["Долго", "Ок"]);
    const later = summarizeRatings([
      {
        rating: 5,
        ratingComment: "Отлично",
        ratedAt: new Date("2026-11-11"),
        type: t("ru", "Об обучении"),
      },
      ...rows,
    ]);
    expect(later.recent.map((r) => r.comment)).toEqual(["Долго", "Ок", "Отлично"]);
  });

  it("пусто — средней нет", () => {
    expect(summarizeRatings([])).toMatchObject({ count: 0, average: null, byType: [], recent: [] });
  });
});

describe("N. Свободные аудитории для переноса пары", () => {
  const msk = (iso: string) => new Date(`${iso}+03:00`);

  it("свободна — встречается в расписании корпуса и не занята в новое время; по возрастанию номера", () => {
    const from = msk("2026-11-11T12:00");
    const to = msk("2026-11-11T14:00");
    const usage = [
      { room: "3014", startsAt: msk("2026-11-10T09:00"), endsAt: msk("2026-11-10T10:20") },
      { room: "2029", startsAt: msk("2026-11-11T12:40"), endsAt: msk("2026-11-11T14:00") }, // занята
      { room: "1052", startsAt: msk("2026-11-11T14:00"), endsAt: msk("2026-11-11T15:20") }, // сразу после — свободна
      { room: "10010", startsAt: msk("2026-11-09T09:00"), endsAt: msk("2026-11-09T10:20") },
    ];
    expect(freeRoomsIn(usage, from, to)).toEqual(["1052", "3014", "10010"]);
  });

  it("рядом — ближайшие по номеру к занятой аудитории; нечисловая — «рядом» нет", () => {
    const free = ["1001", "2024", "2031", "2035", "3014", "Л-503"];
    expect(nearestRooms(free, "2029")).toEqual(["2031", "2024", "2035"]);
    // Нечисловой ориентир — «рядом» не выдумываем
    expect(nearestRooms(free, "Л-503")).toEqual([]);
    expect(nearestRooms([], "2029")).toEqual([]);
  });
});
