import { describe, expect, it } from "vitest";
import { formatLongDay } from "@/lib/dates";

describe("formatLongDay", () => {
  it("«Пятница, 6 ноября» — день недели с заглавной, месяц в родительном", () => {
    expect(formatLongDay(new Date("2026-11-06T09:00:00+03:00"))).toBe("Пятница, 6 ноября");
  });

  it("считает по Москве, а не по часовому поясу сервера", () => {
    // 23:30 UTC 6 ноября — в Москве уже 02:30 субботы
    expect(formatLongDay(new Date("2026-11-06T23:30:00Z"))).toBe("Суббота, 7 ноября");
  });
});
