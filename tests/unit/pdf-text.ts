// Мини-разбор текста из PDF для тестов (T10), без зависимостей: распаковать потоки FlateDecode,
// собрать карты ToUnicode шрифтов и прочитать ими шестнадцатеричные строки текста.
// Шрифтов несколько (PT Sans 400/700, PT Serif), номера глифов у них свои — поэтому каждый поток
// читаем каждой картой и возвращаем все варианты: правильный среди них есть всегда.
import { inflateSync } from "node:zlib";

/**
 * Потоки — по точной длине из словаря объекта (/Length N), а не поиском слова «endstream»:
 * в сжатых данных шрифта эти байты могут встретиться случайно и разрезать поток не там.
 */
function streams(pdf: Buffer): string[] {
  const out: string[] = [];
  const bin = pdf.toString("latin1");
  const re = /\d+ \d+ obj\s*<<((?:(?!>>\s*stream)[\s\S])*)>>\s*stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bin))) {
    const length = /\/Length (\d+)(?! \d+ R)/.exec(m[1]!);
    if (!length) continue;
    const start = m.index + m[0].length;
    const raw = pdf.subarray(start, start + Number(length[1]));
    try {
      out.push(inflateSync(raw).toString("latin1"));
    } catch {
      out.push(raw.toString("latin1"));
    }
    re.lastIndex = start + raw.length;
  }
  return out;
}

const utf16 = (hex: string) => {
  let s = "";
  for (let i = 0; i + 4 <= hex.length; i += 4)
    s += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  return s;
};

function parseCmap(cmap: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const [, body] of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const [, src, dst] of body!.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g))
      map.set(parseInt(src!, 16), utf16(dst!));
  for (const [, body] of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const [, lo, hi, rest] of body!.matchAll(
      /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[^\]]*\]|<[0-9a-fA-F]+>)/g,
    )) {
      const a = parseInt(lo!, 16);
      const b = parseInt(hi!, 16);
      if (rest!.startsWith("[")) {
        [...rest!.matchAll(/<([0-9a-fA-F]*)>/g)].forEach(([, d], i) => map.set(a + i, utf16(d!)));
      } else {
        const base = parseInt(rest!.slice(1, -1), 16);
        for (let c = a; c <= b; c++) map.set(c, String.fromCharCode(base + c - a));
      }
    }
  }
  return map;
}

/** Все прочтения текста страницы (по одному на каждый шрифт). */
export function pdfTextVariants(pdf: Buffer): string[] {
  const all = streams(pdf);
  const cmaps = all.filter((s) => s.includes("begincmap")).map(parseCmap);
  const content = all.filter((s) => /\bT[Jj]\b/.test(s));
  const hexRuns = content.flatMap((c) =>
    [...c.matchAll(/(?<!<)<([0-9a-fA-F\s]+)>(?!>)/g)].map((m) => m[1]!.replace(/\s+/g, "")),
  );
  return cmaps.map((map) =>
    hexRuns
      .map((h) => {
        let s = "";
        for (let i = 0; i + 4 <= h.length; i += 4)
          s += map.get(parseInt(h.slice(i, i + 4), 16)) ?? "";
        return s;
      })
      .join(""),
  );
}

export const pdfContains = (pdf: Buffer, text: string) =>
  pdfTextVariants(pdf).some((v) => v.includes(text));
