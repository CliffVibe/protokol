// Успеваемость (T07): средний рейтинг, правило стипендии на границах, светофор, сортировка, сессия,
// разбор ?semester и id дисциплины. Правило — вымышленное (docs/01-concept.md).
import { describe, expect, it } from "vitest";
import { gradeChip, resultLabel } from "@/components/grades/labels";
import { missingText } from "@/components/grades/discipline-row";
import { formatDayRange, formatInDays } from "@/lib/dates";
import { disciplineIdSchema, parseSemesterParam } from "@/lib/grades-params";
import { formatMinutes, travelMinutes } from "@/lib/buildings";
import { scholarshipTitle } from "@/lib/scholarship";
import {
  averageRating,
  excellentSessionsBefore,
  gradeAttention,
  pointsToThreshold,
  semestersOf,
  sessionSummary,
  sortForAttention,
  summarizeStudy,
  type GradeRow,
} from "@/server/services/academics";

const msk = (iso: string) => new Date(`${iso}+03:00`);

function g(over: Partial<GradeRow> & { name?: string } = {}): GradeRow {
  const { name = "Дисциплина", ...rest } = over;
  return {
    semester: 3,
    kind: "EXAM",
    ratingPoints: 75,
    finalMark: null,
    passed: null,
    examDate: null,
    discipline: { id: `dsc-${name}`, name },
    ...rest,
  };
}

describe("averageRating", () => {
  it("пусто и без баллов → null", () => {
    expect(averageRating([])).toBeNull();
    expect(averageRating([g({ ratingPoints: null })])).toBeNull();
  });
  it("дисциплины без баллов не тянут вниз; округление до целого", () => {
    expect(
      averageRating([g({ ratingPoints: 61 }), g({ ratingPoints: null }), g({ ratingPoints: 70 })]),
    ).toBe(66);
    expect(averageRating([g({ ratingPoints: 60 }), g({ ratingPoints: 61 })])).toBe(61);
  });
});

describe("сессии на «отлично» подряд и три состояния стипендии (T14)", () => {
  it("считаем от прошлой сессии назад, до первой с оценкой ниже 5 или незачётом", () => {
    const five = (semester: number, name: string) => g({ semester, finalMark: 5, name });
    const rows = [
      g({ semester: 1, finalMark: 4 }),
      five(2, "А"),
      g({ semester: 2, kind: "CREDIT", passed: true, name: "Зачёт" }),
      five(3, "Б"),
      g({ semester: 4 }),
    ];
    expect(excellentSessionsBefore(rows, 4)).toBe(2);
    expect(summarizeStudy(rows)?.excellentSessions).toBe(2);
    // Незачёт рвёт серию; сессия из одних зачётов без оценок — не «отлично»
    expect(
      excellentSessionsBefore(
        [five(2, "А"), g({ semester: 3, kind: "CREDIT", passed: false }), g({ semester: 4 })],
        4,
      ),
    ).toBe(0);
    expect(
      excellentSessionsBefore(
        [g({ semester: 1, kind: "CREDIT", passed: true }), g({ semester: 2 })],
        2,
      ),
    ).toBe(0);
  });

  it("подпись: сохраняется / под угрозой (только рейтинг) / не назначена (долг или тройка)", () => {
    expect(scholarshipTitle({ kept: true })).toBe("Стипендия сохраняется");
    expect(scholarshipTitle({ kept: false, lost: false, reasons: [] })).toBe(
      "Стипендия под угрозой",
    );
    expect(scholarshipTitle({ kept: false, lost: true, reasons: [] })).toBe(
      "Стипендия не назначена",
    );
  });

  it("время в дороге: Главный ↔ Одинцово известно в обе стороны, остальное — не выдумываем", () => {
    const MAIN = "Главный корпус (пр-т Вернадского)";
    expect(travelMinutes(MAIN, "Одинцово")).toBe(60);
    expect(travelMinutes("Одинцово", MAIN)).toBe(60);
    expect(travelMinutes(MAIN, "Корпус на Луне")).toBeNull();
    expect(formatMinutes(140)).toBe("2 ч 20 мин");
    expect(formatMinutes(60)).toBe("1 ч");
    expect(formatMinutes(20)).toBe("20 мин");
  });
});

describe("summarizeStudy — правило стипендии на границах", () => {
  it("ровно 60 — ещё сохраняется, 59 — уже под угрозой", () => {
    expect(summarizeStudy([g({ ratingPoints: 60 })])!.scholarship.kept).toBe(true);
    // Только рейтинг — ещё можно исправить: «под угрозой», а не «не назначена»
    expect(summarizeStudy([g({ ratingPoints: 59, name: "Финансы" })])!.scholarship).toEqual({
      kept: false,
      lost: false,
      reasons: ["Финансы: 59 из 100, нужно 60"],
    });
  });

  it("«не зачтено» в прошлом семестре — долг", () => {
    const s = summarizeStudy([
      g({ semester: 2, kind: "CREDIT", passed: false, name: "Философия" }),
      g({ semester: 3 }),
    ])!;
    expect(s.debts).toBe(1);
    expect(s.scholarship).toEqual({ kept: false, lost: true, reasons: ["Долг: Философия"] });
  });

  it("тройка позапрошлой сессии не снимает стипендию, прошлой — снимает", () => {
    const old = summarizeStudy([g({ semester: 1, finalMark: 3 }), g({ semester: 3 })])!;
    expect(old.scholarship.kept).toBe(true);
    const last = summarizeStudy([
      g({ semester: 2, finalMark: 3, name: "История" }),
      g({ semester: 3 }),
    ])!;
    expect(last.scholarship).toEqual({
      kept: false,
      lost: true,
      reasons: ["Оценка 3 в прошлой сессии: История"],
    });
  });

  it("первокурсник без оценок — статуса нет", () => {
    expect(summarizeStudy([])).toBeNull();
  });
});

describe("светофор дисциплины", () => {
  it("долг → ниже 60 (только в текущем) → оценка 3 → в норме", () => {
    expect(gradeAttention(g({ finalMark: 2 }), false)).toBe("debt");
    expect(gradeAttention(g({ passed: false }), true)).toBe("debt");
    expect(gradeAttention(g({ ratingPoints: 54 }), true)).toBe("low");
    // В закрытом семестре низкий рейтинг уже не «риск»: есть итог
    expect(gradeAttention(g({ ratingPoints: 54, finalMark: 4 }), false)).toBe("ok");
    expect(gradeAttention(g({ finalMark: 3 }), false)).toBe("mark3");
    expect(gradeAttention(g({ ratingPoints: 60 }), true)).toBe("ok");
  });

  it("чипы различимы без цвета: у долга и «ниже 60» — свои иконка и текст", () => {
    const debt = gradeChip(g({ finalMark: 2 }), false);
    const low = gradeChip(g({ ratingPoints: 54 }), true);
    expect(debt).toMatchObject({ label: "Долг", tone: "danger" });
    expect(low).toMatchObject({ label: "Ниже 60", tone: "warn" });
    expect(debt.icon).not.toBe(low.icon);
    expect(gradeChip(g({ finalMark: 5 }), false).label).toBe("Отлично (5)");
    expect(gradeChip(g({ kind: "CREDIT", passed: true }), false).label).toBe("Зачтено");
    expect(gradeChip(g({ ratingPoints: null }), true).label).toBe("Баллов пока нет");
  });

  it("итог словом", () => {
    expect(resultLabel(g({ finalMark: 4 }))).toBe("Хорошо (4)");
    expect(resultLabel(g({ passed: false }))).toBe("Не зачтено");
    expect(resultLabel(g())).toBeNull();
  });

  it("сколько не хватает до 60", () => {
    expect(pointsToThreshold(54)).toBe(6);
    expect(pointsToThreshold(60)).toBe(0);
    expect(pointsToThreshold(null)).toBe(0);
    expect(missingText(6)).toBe("Не хватает 6\u00a0баллов до\u00a060");
    expect(missingText(1)).toBe("Не хватает 1\u00a0балла до\u00a060");
  });
});

describe("sortForAttention — сначала проблемные", () => {
  it("долг, потом ниже 60 по возрастанию, потом остальные по алфавиту", () => {
    const rows = [
      g({ name: "Английский", ratingPoints: 80 }),
      g({ name: "Финансы", ratingPoints: 54 }),
      g({ name: "Эконометрика", ratingPoints: 38, finalMark: 2 }),
      g({ name: "Аудит", ratingPoints: 41 }),
      g({ name: "Борьба", ratingPoints: 99 }),
    ];
    expect(sortForAttention(rows, true).map((r) => r.discipline.name)).toEqual([
      "Эконометрика",
      "Аудит",
      "Финансы",
      "Английский",
      "Борьба",
    ]);
  });
});

describe("semestersOf", () => {
  it("уникальные, новые первыми", () => {
    expect(semestersOf([g({ semester: 6 }), g({ semester: 7 }), g({ semester: 6 })])).toEqual([
      7, 6,
    ]);
  });
});

describe("sessionSummary", () => {
  const now = msk("2026-11-06T18:00:00");

  it("даты — только известные; счёт по типам; ближайший — по московскому календарю", () => {
    const s = sessionSummary(
      [
        g({ kind: "EXAM", examDate: msk("2026-11-09T10:00:00"), name: "Мировая экономика" }),
        g({ kind: "EXAM", examDate: msk("2027-01-20T10:00:00") }),
        g({ kind: "GRADED_CREDIT" }),
        g({ kind: "GRADED_CREDIT" }),
      ],
      now,
    )!;
    expect(s.counts).toEqual({ EXAM: 2, CREDIT: 0, GRADED_CREDIT: 2, COURSEWORK: 0 });
    expect(s.from).toEqual(msk("2026-11-09T10:00:00"));
    expect(s.to).toEqual(msk("2027-01-20T10:00:00"));
    expect(s.next).toMatchObject({ name: "Мировая экономика", inDays: 3 });
  });

  it("сданный контроль — не «ближайший»; прошедшая дата — тоже", () => {
    const s = sessionSummary(
      [
        g({ examDate: msk("2026-11-05T10:00:00") }),
        g({ examDate: msk("2026-11-07T10:00:00"), finalMark: 5 }),
        g({ examDate: msk("2026-11-06T23:30:00"), name: "Сегодня ночью" }),
      ],
      now,
    )!;
    expect(s.next).toMatchObject({ name: "Сегодня ночью", inDays: 0 });
  });

  it("без дат — from/to null; без строк — null", () => {
    expect(sessionSummary([g({ kind: "CREDIT" })], now)).toMatchObject({
      from: null,
      to: null,
      next: null,
    });
    expect(sessionSummary([], now)).toBeNull();
  });

  it("подписи: диапазон через год и «через N дней»", () => {
    expect(formatDayRange(msk("2026-11-09T10:00:00"), msk("2027-01-20T10:00:00"), now)).toBe(
      "9 ноября – 20 января 2027",
    );
    expect(formatDayRange(msk("2027-01-13T10:00:00"), msk("2027-01-13T15:00:00"))).toBe(
      "13 января",
    );
    expect(formatInDays(0)).toBe("сегодня");
    expect(formatInDays(1)).toBe("завтра");
    expect(formatInDays(3)).toBe("через 3\u00a0дня");
    expect(formatInDays(21)).toBe("через 21\u00a0день");
    expect(formatInDays(11)).toBe("через 11\u00a0дней");
  });
});

describe("параметры", () => {
  it("?semester — только свой семестр, иначе null (текущий)", () => {
    expect(parseSemesterParam("6", [7, 6])).toBe(6);
    for (const raw of [undefined, "", "5", "99", "6.0", "-6", "шесть", ["6", "7"], " 6"]) {
      expect(parseSemesterParam(raw, [7, 6]), String(raw)).toBeNull();
    }
  });

  it("id дисциплины — только формат; мусор не доходит до БД", () => {
    expect(disciplineIdSchema.safeParse("dsc-en").success).toBe(true);
    expect(disciplineIdSchema.safeParse("cm3x9k2l10000abcd").success).toBe(true);
    for (const raw of ["", "DSC-EN", "dsc en", "../etc", "x".repeat(65), "dsc-en'--"]) {
      expect(disciplineIdSchema.safeParse(raw).success, raw).toBe(false);
    }
  });
});
