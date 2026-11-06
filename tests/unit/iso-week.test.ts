import { describe, expect, it } from "vitest";
import { formatIsoWeek, isoWeekOf, isoWeekStart, isoWeeksInYear } from "@/lib/msk";
import { parseWeekParam } from "@/lib/schedule-params";

const msk = (s: string) => new Date(`${s}+03:00`);

describe("ISO-неделя по Москве", () => {
  it("пятница 6 ноября 2026 — W45, неделя со 2 ноября", () => {
    expect(isoWeekOf(msk("2026-11-06T12:00:00"))).toEqual({ year: 2026, week: 45 });
    expect(formatIsoWeek(msk("2026-11-06T12:00:00"))).toBe("2026-W45");
    expect(isoWeekStart(2026, 45)).toEqual(msk("2026-11-02T00:00:00"));
  });

  it("считает по Москве: 23:30 UTC воскресенья — уже понедельник следующей недели", () => {
    expect(formatIsoWeek(new Date("2026-11-08T21:30:00Z"))).toBe("2026-W46");
    expect(formatIsoWeek(new Date("2026-11-08T20:30:00Z"))).toBe("2026-W45");
  });

  it("границы года: 1 января 2027 — ещё W53 2026, 4 января 2027 — W01", () => {
    expect(isoWeekOf(msk("2027-01-01T10:00:00"))).toEqual({ year: 2026, week: 53 });
    expect(isoWeekOf(msk("2027-01-04T10:00:00"))).toEqual({ year: 2027, week: 1 });
    // 29 декабря 2025 (пн) — уже W01 2026
    expect(isoWeekOf(msk("2025-12-29T10:00:00"))).toEqual({ year: 2026, week: 1 });
  });

  it("в 2026 году 53 недели, в 2025 и 2027 — 52", () => {
    expect(isoWeeksInYear(2026)).toBe(53);
    expect(isoWeeksInYear(2025)).toBe(52);
    expect(isoWeeksInYear(2027)).toBe(52);
  });

  it("isoWeekStart и isoWeekOf — взаимно обратные на всём году", () => {
    for (let w = 1; w <= 53; w++) {
      expect(isoWeekOf(isoWeekStart(2026, w))).toEqual({ year: 2026, week: w });
    }
  });
});

describe("parseWeekParam", () => {
  const now = msk("2026-11-06T12:00:00");

  it("правильная неделя → её понедельник", () => {
    expect(parseWeekParam("2026-W46", now)).toEqual(msk("2026-11-09T00:00:00"));
    expect(parseWeekParam("2026-W53", now)).toEqual(msk("2026-12-28T00:00:00"));
    expect(parseWeekParam("2027-W01", now)).toEqual(msk("2027-01-04T00:00:00"));
  });

  it.each([
    ["нет параметра", undefined],
    ["пусто", ""],
    ["мусор", "мусор"],
    ["W00", "2026-W00"],
    ["W54", "2026-W54"],
    ["W53 в году без неё", "2027-W53"],
    ["W99", "2026-W99"],
    ["строчная w", "2026-w46"],
    ["без ведущего нуля", "2026-W5"],
    ["хвост", "2026-W46x"],
    ["массив (?week=a&week=b)", ["2026-W46", "2026-W47"]],
    ["далеко в прошлом", "2024-W10"],
    ["далеко в будущем", "9999-W01"],
  ])("%s → null (показываем текущую неделю)", (_, raw) => {
    expect(parseWeekParam(raw, now)).toBeNull();
  });
});
