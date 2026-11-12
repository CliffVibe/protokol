// T14: идеи из ресерча — «Вам положено» (J), оценка заявки (K) и подбор свободной аудитории (N; у студента
// снято 11.11 — аудитории закрыты, ключи студентам не дают; осталось сотруднику при переносе пары). Чистые функции.
import { describe, expect, it } from "vitest";
import type { StudySummary } from "@/server/services/academics";
import { offersFor, SCHOLARSHIP_UP_MIN_SESSIONS } from "@/server/services/offer-rules";
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
  ...over,
});
const none = new Set<string>();

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
