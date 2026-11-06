// Markdown объявлений (T09, S5 «Markdown объявлений — через санитайзер»). Свой мини-разбор без зависимостей
// (решение человека 06.11): текст разбирается в дерево блоков, а React рисует его обычными элементами.
// HTML-строк нет нигде — тег из текста остаётся текстом, его экранирует React. Поэтому «санитайзер» здесь —
// это сама грамматика: разрешено только то, что умеет разбор.
//
// Умеет: абзацы (пустая строка), перенос строки, списки «- », «* », «1. », **жирный**, *курсив*,
// [текст](ссылка). Ссылка — только путь внутри сайта или https://; иначе остаётся текст без ссылки.
// Экранирование: \* \[ \] \( \) \\ — символ как есть.
import { safeExternalLink, safeLink } from "./links";

export type Inline =
  | { t: "text"; v: string }
  | { t: "br" }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "link"; href: string; external: boolean; c: Inline[] };

export type Block = { t: "p"; c: Inline[] } | { t: "ul" | "ol"; items: Inline[][] };

const UL = /^\s{0,3}[-*]\s+(.*)$/;
const OL = /^\s{0,3}\d{1,3}[.)]\s+(.*)$/;
/** Глубина вложенности: «жирный внутри ссылки внутри курсива» — дальше уже не разметка, а атака на разбор. */
const MAX_DEPTH = 3;

export function parseMarkdown(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { t: "ul" | "ol"; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) blocks.push({ t: "p", c: parseLines(para) });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ t: list.t, items: list.items.map((i) => parseInline(i, 0)) });
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    const ul = UL.exec(line);
    const ol = ul ? null : OL.exec(line);
    const item = ul ?? ol;
    if (item) {
      flushPara();
      const kind = ul ? "ul" : "ol";
      if (list && list.t !== kind) flushList();
      list ??= { t: kind, items: [] };
      list.items.push(item[1]!);
      continue;
    }
    // Строка сразу после пункта списка без отступа — продолжение абзаца, а не пункта: проще и предсказуемо
    flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return blocks;
}

/** Строки абзаца: между ними — перенос строки. */
function parseLines(lines: string[]): Inline[] {
  return lines.flatMap((l, i) =>
    i ? [{ t: "br" } as const, ...parseInline(l, 0)] : parseInline(l, 0),
  );
}

const ESCAPABLE = new Set(["*", "[", "]", "(", ")", "\\", "_"]);

/** Индекс закрывающего `delim`, не экранированного, с непустым содержимым; -1 — нет. */
function findClose(s: string, from: number, delim: string): number {
  for (let i = from; i <= s.length - delim.length; i++) {
    if (s[i] === "\\") {
      i++;
      continue;
    }
    if (s.startsWith(delim, i)) {
      // «**» не закрывает одиночную «*»
      if (delim === "*" && s[i + 1] === "*") {
        i++;
        continue;
      }
      return i > from ? i : -1;
    }
  }
  return -1;
}

function parseInline(s: string, depth: number): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const pushText = () => {
    if (buf) out.push({ t: "text", v: buf });
    buf = "";
  };

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "\\" && i + 1 < s.length && ESCAPABLE.has(s[i + 1]!)) {
      buf += s[i + 1];
      i++;
      continue;
    }
    if (depth < MAX_DEPTH && s.startsWith("**", i)) {
      const end = findClose(s, i + 2, "**");
      if (end > 0 && s[i + 2] !== " " && s[end - 1] !== " ") {
        pushText();
        out.push({ t: "strong", c: parseInline(s.slice(i + 2, end), depth + 1) });
        i = end + 1;
        continue;
      }
    }
    if (depth < MAX_DEPTH && ch === "*" && s[i + 1] !== "*") {
      const end = findClose(s, i + 1, "*");
      if (end > 0 && s[i + 1] !== " " && s[end - 1] !== " ") {
        pushText();
        out.push({ t: "em", c: parseInline(s.slice(i + 1, end), depth + 1) });
        i = end;
        continue;
      }
    }
    if (depth < MAX_DEPTH && ch === "[") {
      const link = parseLink(s, i, depth);
      if (link) {
        pushText();
        out.push(...link.nodes);
        i = link.end;
        continue;
      }
    }
    buf += ch;
  }
  pushText();
  return out;
}

/** `[текст](адрес)` с позиции `i`. Небезопасный адрес — остаётся только текст ссылки. */
function parseLink(s: string, i: number, depth: number): { nodes: Inline[]; end: number } | null {
  const close = findClose(s, i + 1, "]");
  if (close < 0 || s[close + 1] !== "(") return null;
  // Скобки в адресе — парами: «(javascript:alert(1))» целиком адрес, а не «javascript:alert(1» и хвост «)»
  let urlEnd = -1;
  for (let j = close + 2, open = 0; j < s.length; j++) {
    if (s[j] === "(") open++;
    else if (s[j] === ")") {
      if (open === 0) {
        urlEnd = j;
        break;
      }
      open--;
    }
  }
  if (urlEnd < 0) return null;
  const label = s.slice(i + 1, close);
  const url = s.slice(close + 2, urlEnd).trim();
  // Внутри текста ссылки — жирный и курсив, но не ещё одна ссылка
  const c = parseInline(label.replace(/\[|\]/g, ""), depth + 1);
  const internal = safeLink(url);
  const external = internal ? null : safeExternalLink(url);
  const href = internal ?? external;
  return {
    nodes: href ? [{ t: "link", href, external: !internal, c }] : c,
    end: urlEnd,
  };
}

// ── Простой текст: тело уведомления, строка объявления на «Сейчас» ──

function inlineText(nodes: Inline[]): string {
  return nodes.map((n) => (n.t === "text" ? n.v : n.t === "br" ? " " : inlineText(n.c))).join("");
}

/** Текст без разметки, одной строкой; длиннее `max` — с многоточием. */
export function markdownToPlain(text: string, max = Infinity): string {
  const plain = parseMarkdown(text)
    .map((b) => (b.t === "p" ? inlineText(b.c) : b.items.map(inlineText).join("; ")))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}
