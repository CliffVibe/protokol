import "server-only";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { isActionId, type AssistantActionId } from "@/lib/assistant-actions";

// База ответов без ИИ (T12): вымышленные статьи content/faq/*.md. Работает всегда — и как режим
// «без ключа», и как справка для GigaChat (3 лучшие статьи идут в промпт). Поиск — свой и простой:
// слова в нижнем регистре, ё → е, «основа» — первые 5 букв (русские окончания не мешают:
// «справку» и «справка» совпадут). Очки: ключевые слова ×3, заголовок ×2, текст ×1.
// Разбор и поиск — чистые функции (tests/unit/assistant-faq.test.ts); с диска читает только loadFaq().

export type FaqArticle = {
  slug: string;
  title: string;
  keywords: string[];
  actions: AssistantActionId[];
  body: string;
};

export type FaqHit = { article: FaqArticle; score: number };

/** Ниже — «не нашёл»: одно случайное совпадение в тексте статьи не ответ. */
export const MIN_SCORE = 3;
const STEM = 5;

export function normalize(text: string): string {
  return text.toLowerCase().replaceAll("ё", "е");
}

/** Слова длиннее двух букв → основы. «Как», «мне», «для» тоже слова — их отсекает список ниже. */
const STOP = new Set([
  "как",
  "мне",
  "для",
  "что",
  "где",
  "когда",
  "это",
  "или",
  "мой",
  "моя",
  "мои",
  "нужн",
  "можн",
  "есть",
]);

export function stems(text: string): string[] {
  return (normalize(text).match(/[a-zа-я0-9]+/g) ?? [])
    .filter((w) => w.length > 2)
    .map((w) => w.slice(0, STEM))
    .filter((s) => !STOP.has(s));
}

/** frontmatter из трёх полей между «---»; битая статья — ошибка сразу (её ловит юнит-тест). */
export function parseArticle(slug: string, raw: string): FaqArticle {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw.replace(/\r\n?/g, "\n"));
  if (!m) throw new Error(`FAQ ${slug}: нет frontmatter`);
  const meta = new Map<string, string>();
  for (const line of (m[1] ?? "").split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta.set(line.slice(0, i).trim(), line.slice(i + 1).trim());
  }
  const title = meta.get("title");
  if (!title) throw new Error(`FAQ ${slug}: нет title`);
  const list = (key: string) =>
    (meta.get(key) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  const actions = list("actions");
  const bad = actions.filter((a) => !isActionId(a));
  if (bad.length) throw new Error(`FAQ ${slug}: неизвестные действия ${bad.join(", ")}`);
  return {
    slug,
    title,
    keywords: list("keywords"),
    actions: actions.filter(isActionId),
    body: (m[2] ?? "").trim(),
  };
}

type Indexed = { article: FaqArticle; kw: string[][]; title: Set<string>; body: Set<string> };

function index(a: FaqArticle): Indexed {
  return {
    article: a,
    kw: a.keywords.map(stems).filter((k) => k.length),
    title: new Set(stems(a.title)),
    body: new Set(stems(a.body)),
  };
}

const indexCache = new WeakMap<FaqArticle[], Indexed[]>();

/**
 * Лучшие статьи по вопросу. Ключевая фраза засчитывается, если в вопросе есть все её основы
 * («академический отпуск» → обе); за каждую основу вопроса в заголовке +2, в тексте +1.
 */
export function searchFaq(articles: FaqArticle[], question: string, limit = 3): FaqHit[] {
  let idx = indexCache.get(articles);
  if (!idx) {
    idx = articles.map(index);
    indexCache.set(articles, idx);
  }
  const q = new Set(stems(question));
  if (!q.size) return [];
  const hits: FaqHit[] = [];
  for (const it of idx) {
    let score = 0;
    for (const k of it.kw) if (k.every((s) => q.has(s))) score += 3;
    for (const s of q) {
      if (it.title.has(s)) score += 2;
      else if (it.body.has(s)) score += 1;
    }
    if (score >= MIN_SCORE) hits.push({ article: it.article, score });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

let cached: FaqArticle[] | null = null;

/** Статьи с диска (content/faq; в standalone-образ их кладёт outputFileTracingIncludes). Кэш на процесс. */
export function loadFaq(dir = path.join(process.cwd(), "content", "faq")): FaqArticle[] {
  if (cached) return cached;
  cached = readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .sort()
    .map((f) => parseArticle(f.slice(0, -3), readFileSync(path.join(dir, f), "utf8")));
  return cached;
}
