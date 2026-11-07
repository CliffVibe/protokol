// «Что если…» (T11): прогноз стипендии по выбранным итогам сессии — то же правило, что на сервере
// (src/lib/scholarship.ts). Прежние тесты summarizeStudy (academics.test.ts) — положительный контроль
// того, что перенос правила ничего не поменял.
import { describe, expect, it } from "vitest";
import { summarizeStudy } from "@/server/services/academics";
import { projectSession, scholarshipAsOf, type GradeRow } from "@/lib/scholarship";

function g(over: Partial<GradeRow> & { name: string }): GradeRow {
  const { name, ...rest } = over;
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

// Как у Алисы: прошлая сессия чистая, в текущей шесть дисциплин без итога
const alisa: GradeRow[] = [
  g({ semester: 2, name: "История", finalMark: 5 }),
  g({ semester: 2, name: "Право", finalMark: 4 }),
  g({ semester: 2, name: "Физкультура", kind: "CREDIT", passed: true }),
  g({ semester: 3, name: "Микроэкономика", ratingPoints: 76 }),
  g({ semester: 3, name: "Макроэкономика", ratingPoints: 82 }),
  g({ semester: 3, name: "Риторика", kind: "CREDIT", ratingPoints: 90 }),
  g({ semester: 3, name: "Статистика", kind: "GRADED_CREDIT", ratingPoints: 73 }),
];

describe("projectSession", () => {
  it("ничего не выбрано — сохранится, невыбранные считаем сданными на 4+", () => {
    const p = projectSession(alisa, 3, {});
    expect(p.scholarship).toEqual({ kept: true });
    expect(p.unpicked).toBe(4);
    expect(p.average).toBeNull();
  });

  it("экзамен на 3 → под угрозой, причина — эта оценка", () => {
    const p = projectSession(alisa, 3, { "dsc-Микроэкономика": { mark: 3 } });
    expect(p.scholarship).toEqual({ kept: false, reasons: ["Оценка 3: Микроэкономика"] });
    expect(p.unpicked).toBe(3);
    expect(p.average).toBe(3);
  });

  it("всё на 4 и 5 → сохранится, средний балл с одним знаком", () => {
    const p = projectSession(alisa, 3, {
      "dsc-Микроэкономика": { mark: 5 },
      "dsc-Макроэкономика": { mark: 4 },
      "dsc-Статистика": { mark: 4 },
      "dsc-Риторика": { passed: true },
    });
    expect(p.scholarship).toEqual({ kept: true });
    expect(p.unpicked).toBe(0);
    expect(p.average).toBe(4.3);
  });

  it("незачёт и двойка → долги", () => {
    const p = projectSession(alisa, 3, {
      "dsc-Риторика": { passed: false },
      "dsc-Макроэкономика": { mark: 2 },
    });
    expect(p.scholarship.kept).toBe(false);
    expect(!p.scholarship.kept && p.scholarship.reasons).toEqual([
      "Долг: Макроэкономика",
      "Долг: Риторика",
    ]);
  });

  it("старый долг (как у Тимура) не исчезает от хороших оценок", () => {
    const timur = [
      g({ semester: 6, name: "Эконометрика", finalMark: 2, ratingPoints: 38 }),
      g({ semester: 7, name: "Финансы", ratingPoints: 54 }),
    ];
    const p = projectSession(timur, 7, { "dsc-Финансы": { mark: 5 } });
    expect(p.scholarship).toEqual({ kept: false, reasons: ["Долг: Эконометрика"] });
  });

  it("рейтинг ниже 60 сейчас не мешает прогнозу: итог его заменяет", () => {
    const rows = [g({ semester: 2, name: "А", finalMark: 5 }), g({ name: "Б", ratingPoints: 54 })];
    expect(scholarshipAsOf(rows, 3).kept).toBe(false);
    expect(projectSession(rows, 3, { "dsc-Б": { mark: 4 } }).scholarship).toEqual({ kept: true });
  });

  it("известные итоги текущей сессии тоже считаются, выбор для них игнорируется", () => {
    const rows = [...alisa, g({ name: "Логика", finalMark: 3 })];
    const p = projectSession(rows, 3, { "dsc-Логика": { mark: 5 } });
    expect(p.scholarship).toEqual({ kept: false, reasons: ["Оценка 3: Логика"] });
  });

  it("серверная сводка и общее правило совпадают", () => {
    expect(summarizeStudy(alisa)?.scholarship).toEqual(scholarshipAsOf(alisa, 3));
  });
});
