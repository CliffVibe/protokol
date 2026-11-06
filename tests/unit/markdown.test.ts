// Markdown объявлений и ссылки (T09, S5): разбор в дерево и вывод без сырого HTML.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "@/components/markdown";
import { assertLink, relativeLinkSchema, safeExternalLink, safeLink } from "@/lib/links";
import { markdownToPlain, parseMarkdown } from "@/lib/markdown";

const html = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }));

describe("parseMarkdown", () => {
  it("абзацы, перенос строки, жирный, курсив", () => {
    expect(parseMarkdown("Привет, **мир** и *всё*\nвторая строка\n\nНовый абзац")).toEqual([
      {
        t: "p",
        c: [
          { t: "text", v: "Привет, " },
          { t: "strong", c: [{ t: "text", v: "мир" }] },
          { t: "text", v: " и " },
          { t: "em", c: [{ t: "text", v: "всё" }] },
          { t: "br" },
          { t: "text", v: "вторая строка" },
        ],
      },
      { t: "p", c: [{ t: "text", v: "Новый абзац" }] },
    ]);
  });

  it("списки маркированные и нумерованные", () => {
    expect(parseMarkdown("- один\n* два\n\n1. первый\n2) второй")).toEqual([
      { t: "ul", items: [[{ t: "text", v: "один" }], [{ t: "text", v: "два" }]] },
      { t: "ol", items: [[{ t: "text", v: "первый" }], [{ t: "text", v: "второй" }]] },
    ]);
  });

  it("незакрытые и пустые маркеры остаются текстом", () => {
    expect(parseMarkdown("**не закрыто и * одна звезда, ** пробел **")).toEqual([
      { t: "p", c: [{ t: "text", v: "**не закрыто и * одна звезда, ** пробел **" }] },
    ]);
    expect(parseMarkdown("****")).toEqual([{ t: "p", c: [{ t: "text", v: "****" }] }]);
  });

  it("экранирование", () => {
    expect(parseMarkdown("\\*звёздочка\\* и \\[скобки\\]")).toEqual([
      { t: "p", c: [{ t: "text", v: "*звёздочка* и [скобки]" }] },
    ]);
  });

  it("ссылка внутри сайта и https — ссылка; остальное — только текст", () => {
    const [p] = parseMarkdown("[Заявки](/requests) и [сайт](https://example.org/a)");
    expect(p).toEqual({
      t: "p",
      c: [
        { t: "link", href: "/requests", external: false, c: [{ t: "text", v: "Заявки" }] },
        { t: "text", v: " и " },
        {
          t: "link",
          href: "https://example.org/a",
          external: true,
          c: [{ t: "text", v: "сайт" }],
        },
      ],
    });
    for (const bad of [
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "//evil.example",
      "/\\evil.example",
      "http://plain.example",
      "data:text/html,x",
      "https://user:pw@evil.example",
      "vbscript:x",
    ]) {
      const [b] = parseMarkdown(`[жми](${bad})`);
      expect(b, bad).toEqual({ t: "p", c: [{ t: "text", v: "жми" }] });
    }
  });

  it("глубокая вложенность не роняет разбор", () => {
    const deep = "**".repeat(200) + "x" + "**".repeat(200);
    expect(() => parseMarkdown(deep)).not.toThrow();
    expect(() => parseMarkdown("[".repeat(5000))).not.toThrow();
  });
});

describe("Markdown (вывод)", () => {
  it("теги из текста остаются текстом", () => {
    const out = html('<script>alert(1)</script> <img src=x onerror="alert(1)">');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;script&gt;");
  });

  it("в href не попадает javascript:", () => {
    const out = html("[жми](javascript:alert(1)) [ок](/schedule)");
    expect(out).not.toMatch(/href="javascript/i);
    expect(out).toContain('href="/schedule"');
  });

  it("внешняя ссылка — noopener и подпись для скринридера", () => {
    const out = html("[сайт](https://example.org)");
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain("(внешняя ссылка)");
  });

  it("списки — ul/ol", () => {
    expect(html("- а\n- б")).toContain("<ul");
    expect(html("1. а")).toContain("<ol");
  });
});

describe("markdownToPlain", () => {
  it("без разметки, одной строкой", () => {
    expect(
      markdownToPlain("**Важно:** сдать *до пятницы*\n\n- эссе\n- реферат\n\n[Заявки](/requests)"),
    ).toBe("Важно: сдать до пятницы эссе; реферат Заявки");
  });
  it("обрезает с многоточием", () => {
    expect(markdownToPlain("Очень длинный текст объявления", 12)).toBe("Очень длинн…");
    expect(markdownToPlain("Коротко", 12)).toBe("Коротко");
  });
});

describe("links", () => {
  it("safeLink и relativeLinkSchema: только путь внутри сайта", () => {
    for (const ok of [
      "/notifications?tab=announcements#announcement-ann-1",
      "/schedule?day=2026-11-07",
      "/requests/%D0%A1-2026-00001",
    ]) {
      expect(safeLink(ok)).toBe(ok);
      expect(assertLink(ok)).toBe(ok);
    }
    for (const bad of [
      "javascript:alert(1)",
      "//evil",
      "/\\evil",
      "https://x",
      "/a b",
      "",
      "a/b",
    ]) {
      expect(safeLink(bad), bad).toBeNull();
      expect(relativeLinkSchema.safeParse(bad).success, bad).toBe(false);
    }
    expect(safeLink(null)).toBeNull();
    expect(() => assertLink("javascript:alert(1)")).toThrow();
    expect(relativeLinkSchema.safeParse("/" + "a".repeat(300)).success).toBe(false);
  });
  it("safeExternalLink: только https без учётных данных", () => {
    expect(safeExternalLink("https://example.org/x?y=1")).toBe("https://example.org/x?y=1");
    for (const bad of [
      "http://example.org",
      "javascript:alert(1)",
      "https://a:b@x.org",
      "not a url",
    ])
      expect(safeExternalLink(bad), bad).toBeNull();
  });
});
