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
const TEXT_PAIRS: [string, string, string][] = [
  ...["ink", "ink-muted", "brand", "ok", "warn", "danger", "seal"].flatMap(
    (fg): [string, string, string][] => [
      [fg, "bg", "текст на фоне страницы"],
      [fg, "surface", "текст на карточке, StatusChip"],
    ],
  ),
  ["ink", "brand-soft", "текст на акцентной плашке"],
  ["brand", "brand-soft", "активный пункт навигации, иконка EmptyState"],
  ["bg", "brand", "кнопка default, UnreadBadge"],
  ["danger", "surface", "кнопка destructive"],
];

// Документированные исключения (04-design, хвосты T01): на brand-soft эти цвета для текста запрещены.
const FORBIDDEN_ON_BRAND_SOFT = ["ink-muted", "ok"];

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

describe("запрещённые пары на --brand-soft", () => {
  it.each(FORBIDDEN_ON_BRAND_SOFT)("светлый --%s на --brand-soft действительно < 4.5", (fg) => {
    expect(contrast(THEMES.light[fg]!, THEMES.light["brand-soft"]!)).toBeLessThan(4.5);
  });

  it("компоненты не ставят эти цвета текста на bg-brand-soft", () => {
    const files = [
      "src/components/concept-banner.tsx",
      "src/components/empty-state.tsx",
      "src/components/nav/side-nav.tsx",
      "src/components/nav/bottom-nav.tsx",
    ];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      // Проверяем каждый строковый литерал с классами: в одном литерале фон и цвет текста встречаются вместе
      for (const literal of src.match(/"[^"]*bg-brand-soft[^"]*"/g) ?? []) {
        for (const fg of FORBIDDEN_ON_BRAND_SOFT) {
          expect(literal, `${file}: text-${fg} на bg-brand-soft`).not.toMatch(
            new RegExp(`(^|[\\s"])text-${fg}(\\s|"|$)`),
          );
        }
      }
    }
  });
});
