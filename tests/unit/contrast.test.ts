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
  ["bg", "brand", "UnreadBadge"],
  // Б′ (10.11): заливки ультрамарином и мятой
  ["on-plate", "plate", "заливная кнопка, плашка ближайшей пары"],
  ["plate-muted", "plate", "подписи и конец пары на плашке"],
  ["on-mint", "mint", "текст на мяте: «Готова», «Стипендия сохраняется», «через N мин»"],
];

describe.each(Object.entries(THEMES))("контраст, тема %s", (theme, tokens) => {
  it("все 16 токенов дизайна на месте", () => {
    for (const t of ["bg", "surface", "ink", "ink-muted", "line", "brand", "brand-soft"]) {
      expect(tokens[t], `--${t}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
    for (const t of ["ok", "warn", "danger", "seal"]) {
      expect(tokens[t], `--${t}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
    for (const t of ["plate", "on-plate", "plate-muted", "mint", "on-mint"]) {
      expect(tokens[t], `--${t}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("мятная пометка различима на плашке ≥ 3:1 (не текст — граница пометки)", () => {
    expect(contrast(tokens.mint!, tokens.plate!)).toBeGreaterThanOrEqual(3);
  });

  it("фокус на плашке: белая обводка (--on-plate) на --plate ≥ 3:1", () => {
    expect(contrast(tokens["on-plate"]!, tokens.plate!)).toBeGreaterThanOrEqual(3);
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

describe("различимость смысловых цветов (ΔE в OKLab — ближе к восприятию, чем RGB)", () => {
  // Печать («Выдана») не должна сливаться ни с ошибкой, ни с акцентом («В работе»).
  // Прежние провалы: винная печать ≈ --danger (крем-палитра), розоватая печать ≈ --brand в тёмной «Бланка» (ΔE ≈ 9).
  const linear = (hex: string) =>
    [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
  const oklab = (hex: string): [number, number, number] => {
    const [r, g, b] = linear(hex);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  };
  const deltaE = (a: string, b: string) => {
    const [x, y] = [oklab(a), oklab(b)];
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 100;
  };

  it("ΔE считается верно: белый–чёрный = 100", () => {
    expect(deltaE("#ffffff", "#000000")).toBeCloseTo(100, 0);
  });

  it.each(Object.entries(THEMES))(
    "%s: --seal далеко от --danger (≥ 15) и от --brand (≥ 10)",
    (_, t) => {
      expect(deltaE(t.seal!, t.danger!)).toBeGreaterThanOrEqual(15);
      expect(deltaE(t.seal!, t.brand!)).toBeGreaterThanOrEqual(10);
    },
  );

  it("прежняя тёмная печать #D59BE4 у акцента #9CB2EC тест бы не прошла", () => {
    expect(deltaE("#d59be4", "#9cb2ec")).toBeLessThan(10);
  });
});
