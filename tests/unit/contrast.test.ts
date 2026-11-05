// Контраст текста ≥ 4.5:1 (WCAG AA) для всех пар «текст на фоне», которые используют компоненты.
// Токены читаются прямо из globals.css — тест упадёт, если кто-то поменяет цвет и сломает контраст.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");

function tokensFrom(selector: RegExp): Record<string, string> {
  const block = css.match(selector)?.[1];
  if (!block) throw new Error(`Не нашёл блок токенов ${selector}`);
  return Object.fromEntries(
    [...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1], m[2]]),
  );
}

const THEMES = {
  light: tokensFrom(/:root\s*\{([^}]*--bg:[^}]*)\}/),
  dark: tokensFrom(/\n\.dark\s*\{([^}]*)\}/),
};

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// [текст, фон, где используется]
// Палитра «Бланк» (06.11) закрыла прежние исключения: --ink-muted и --ok на --brand-soft тоже ≥ 4.5,
// поэтому все цвета текста проверяются на всех трёх фонах — запрещённых пар больше нет.
const TEXT_PAIRS: [string, string, string][] = [
  ...["ink", "ink-muted", "brand", "ok", "warn", "danger", "seal"].flatMap(
    (fg): [string, string, string][] => [
      [fg, "bg", "текст на фоне страницы"],
      [fg, "surface", "текст на карточке, поле, StatusChip"],
      [fg, "brand-soft", "текст на акцентной плашке, выбранная тема"],
    ],
  ),
  ["bg", "brand", "кнопка default, UnreadBadge"],
];

describe.each(Object.entries(THEMES))("контраст, тема %s", (theme, tokens) => {
  it("все 11 токенов дизайна на месте", () => {
    for (const t of ["bg", "surface", "ink", "ink-muted", "line", "brand", "brand-soft"]) {
      expect(tokens[t], `--${t}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
    for (const t of ["ok", "warn", "danger", "seal"]) {
      expect(tokens[t], `--${t}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it.each(TEXT_PAIRS)("--%s на --%s ≥ 4.5 (%s)", (fg, bg) => {
    const ratio = contrast(tokens[fg]!, tokens[bg]!);
    expect(ratio, `${theme}: --${fg} на --${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
  });

  it("фокус (--ring = --brand) различим на фоне ≥ 3:1", () => {
    expect(contrast(tokens.brand!, tokens.bg!)).toBeGreaterThanOrEqual(3);
    expect(contrast(tokens.brand!, tokens.surface!)).toBeGreaterThanOrEqual(3);
  });
});

describe("различимость смысловых цветов", () => {
  // Печать («Выдана») не должна сливаться с ошибкой: в прежней палитре винный --seal был
  // почти неотличим от --danger (расстояние 48 / 33), «Выдана» рисковала читаться как сбой.
  const distance = (a: string, b: string) =>
    Math.hypot(
      ...[1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)),
    );
  it.each(Object.entries(THEMES))("%s: --seal далеко от --danger и от --brand", (_, t) => {
    expect(distance(t.seal!, t.danger!)).toBeGreaterThan(80);
    expect(distance(t.seal!, t.brand!)).toBeGreaterThan(55);
  });
});
