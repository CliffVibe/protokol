import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEME_COLORS, parseTheme, themeClass, themeColorFor } from "@/lib/theme";

describe("тема", () => {
  it("parseTheme принимает только light/dark, остальное — системная", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme(undefined)).toBe("system");
    expect(parseTheme("")).toBe("system");
    expect(parseTheme("DARK")).toBe("system");
    expect(parseTheme("<script>")).toBe("system");
  });

  it("класс на <html> только для явного выбора", () => {
    expect(themeClass("light")).toBe("light");
    expect(themeClass("dark")).toBe("dark");
    expect(themeClass("system")).toBeUndefined();
  });

  it("theme-color: один цвет для выбранной темы, пара по media для системной", () => {
    expect(themeColorFor("dark")).toBe(THEME_COLORS.dark);
    expect(themeColorFor("light")).toBe(THEME_COLORS.light);
    expect(themeColorFor("system")).toEqual([
      { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
      { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
    ]);
  });

  it("цвета theme-color совпадают с --bg в globals.css (шапки на бумаге)", () => {
    const css = readFileSync("src/app/globals.css", "utf8").toLowerCase();
    const light = css.match(/:root\s*\{[^}]*--bg:\s*(#[0-9a-f]{6})/)?.[1];
    const dark = css.match(/\n\.dark\s*\{[^}]*--bg:\s*(#[0-9a-f]{6})/)?.[1];
    expect(THEME_COLORS.light.toLowerCase()).toBe(light);
    expect(THEME_COLORS.dark.toLowerCase()).toBe(dark);
  });
});
