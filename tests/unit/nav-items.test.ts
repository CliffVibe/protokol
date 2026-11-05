import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BOTTOM_NAV, MORE, MORE_ITEMS, SIDE_NAV, isActive } from "@/components/nav/nav-items";
import { unreadLabel } from "@/components/nav/unread-badge";

describe("навигация студента", () => {
  it("нижняя панель — 5 пунктов в порядке 04-design", () => {
    expect(BOTTOM_NAV.map((i) => i.label)).toEqual([
      "Сейчас",
      "Расписание",
      "Учёба",
      "Заявки",
      "Ещё",
    ]);
  });

  it("за «Ещё» — уведомления, профиль, помощник; на десктопе они в общем списке", () => {
    expect(MORE_ITEMS.map((i) => i.label)).toEqual(["Уведомления", "Профиль", "Помощник"]);
    expect(SIDE_NAV).toHaveLength(7);
    expect(SIDE_NAV).not.toContain(MORE);
  });

  it("у каждого пункта есть страница в (student)", () => {
    for (const { href } of [...BOTTOM_NAV, ...SIDE_NAV]) {
      const file = `src/app/(student)${href === "/" ? "" : href}/page.tsx`;
      expect(existsSync(file), file).toBe(true);
    }
  });

  it("активный пункт: «Сейчас» — только /, «Ещё» — и его подпункты", () => {
    const [now, schedule] = BOTTOM_NAV;
    expect(isActive(now!, "/")).toBe(true);
    expect(isActive(now!, "/schedule")).toBe(false);
    expect(isActive(schedule!, "/schedule")).toBe(true);
    expect(isActive(schedule!, "/schedule/week")).toBe(true);
    expect(isActive(schedule!, "/schedules")).toBe(false);
    for (const path of ["/more", "/notifications", "/profile", "/assistant"]) {
      expect(isActive(MORE, path), path).toBe(true);
    }
    expect(isActive(MORE, "/requests")).toBe(false);
  });
});

describe("бейдж непрочитанных", () => {
  it.each([
    [1, "1 непрочитанное"],
    [3, "3 непрочитанных"],
    [11, "11 непрочитанных"],
    [21, "21 непрочитанное"],
    [120, "120 непрочитанных"],
  ])("%i → «%s»", (n, text) => {
    expect(unreadLabel(n)).toBe(text);
  });
});
