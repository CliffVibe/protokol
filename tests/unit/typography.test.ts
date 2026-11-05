// Шкала типографики 04-design (12 / 14 / 16 / 18 / 22 / 28 / 36) и слияние классов cn.
// Ловит ошибку, найденную ux-reviewer 06.11: свои имена размеров (text-body…) tailwind-merge внутри cn
// принимал за цвет и выкидывал вместе с text-ink — кнопка lg теряла цвет текста (1.5:1 на --brand).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

const SCALE = {
  xs: "0.75rem",
  sm: "0.875rem",
  base: "1rem",
  lg: "1.125rem",
  xl: "1.375rem",
  "2xl": "1.75rem",
  "3xl": "2.25rem",
} as const;

const css = readFileSync("src/app/globals.css", "utf8");

describe("шкала типографики", () => {
  it.each(Object.entries(SCALE))("--text-%s = %s (rem, по 04-design)", (name, value) => {
    expect(css).toMatch(new RegExp(`--text-${name}:\\s*${value.replace(".", "\\.")};`));
  });

  it("размеры Tailwind вне шкалы отключены", () => {
    expect(css).toContain("--text-*: initial;");
  });
});

describe("cn сохраняет и размер, и цвет текста", () => {
  const colors = ["text-ink", "text-ink-muted", "text-brand", "text-primary-foreground", "text-bg"];
  for (const size of Object.keys(SCALE)) {
    it.each(colors)(`text-${size} + %s`, (color) => {
      const merged = cn(`text-${size}`, color).split(" ");
      expect(merged).toContain(`text-${size}`);
      expect(merged).toContain(color);
      const reversed = cn(color, `text-${size}`).split(" ");
      expect(reversed).toContain(`text-${size}`);
      expect(reversed).toContain(color);
    });
  }

  it("кнопка lg сохраняет цвет текста варианта default", async () => {
    const { buttonVariants } = await import("@/components/ui/button");
    const classes = buttonVariants({ variant: "default", size: "lg" }).split(" ");
    expect(classes).toContain("text-primary-foreground");
    expect(classes).toContain("text-base");
  });
});
