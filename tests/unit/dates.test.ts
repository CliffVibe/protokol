import { describe, expect, it } from "vitest";
import { formatDayShort, formatLessonCount, formatLongDay, formatWeekRange } from "@/lib/dates";

describe("formatLongDay", () => {
  it("«Пятница, 6 ноября» — день недели с заглавной, месяц в родительном", () => {
    expect(formatLongDay(new Date("2026-11-06T09:00:00+03:00"))).toBe("Пятница, 6 ноября");
  });

  it("считает по Москве, а не по часовому поясу сервера", () => {
    // 23:30 UTC 6 ноября — в Москве уже 02:30 субботы
    expect(formatLongDay(new Date("2026-11-06T23:30:00Z"))).toBe("Суббота, 7 ноября");
  });
});

describe("даты расписания (T06)", () => {
  const msk = (s: string) => new Date(`${s}+03:00`);

  it("formatWeekRange: внутри месяца и через границу месяца", () => {
    expect(formatWeekRange(msk("2026-11-09T00:00:00"))).toBe("9–15 ноября");
    expect(formatWeekRange(msk("2026-11-30T00:00:00"))).toBe("30 ноября – 6 декабря");
  });

  it("formatDayShort — по Москве", () => {
    expect(formatDayShort(msk("2026-11-12T00:00:00"))).toEqual({ weekday: "чт", day: "12" });
  });

  it.each([
    [1, "1 пара"],
    [2, "2 пары"],
    [4, "4 пары"],
    [5, "5 пар"],
    [11, "11 пар"],
    [12, "12 пар"],
    [21, "21 пара"],
    [22, "22 пары"],
  ])("formatLessonCount(%i) = «%s»", (n, text) => {
    expect(formatLessonCount(n)).toBe(text);
  });
});

describe("formatWeekRange с годом", () => {
  const msk = (s: string) => new Date(`${s}+03:00`);
  const now = msk("2026-11-06T12:00:00");
  it("текущий год — без года, другой — с годом", () => {
    expect(formatWeekRange(msk("2026-11-09T00:00:00"), now)).toBe("9–15 ноября");
    expect(formatWeekRange(msk("2027-05-17T00:00:00"), now)).toBe("17–23 мая 2027");
    expect(formatWeekRange(msk("2026-12-28T00:00:00"), now)).toBe("28 декабря – 3 января 2027");
  });
});
