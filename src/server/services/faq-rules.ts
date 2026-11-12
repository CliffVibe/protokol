// База знаний из заявок (T14+): обезличивание ответа сотрудника, черновик записи, форма. Чистые функции
// без БД (tests/unit/faq-rules.test.ts). Обезличивание — правилами, не ИИ: детерминированно и проверяемо;
// публикует всё равно человек, а при публикации те же правила проверяют текст ещё раз.
import { z } from "zod";

export const REMOVED = {
  name: "имя студента",
  number: "номер заявки",
  group: "номер группы",
  recordBook: "номер зачётки",
  phone: "телефон",
  email: "e-mail",
  link: "ссылка",
  digits: "длинный номер",
} as const;
export type RemovedKind = keyof typeof REMOVED;
export const removedKindSchema = z.enum(Object.keys(REMOVED) as [RemovedKind, ...RemovedKind[]]);

const MASK = "…";

/** Шаблоны без привязки к человеку: номера, контакты, ссылки. Порядок важен — длинное раньше короткого. */
const PATTERNS: [RemovedKind, RegExp][] = [
  ["number", /(?<!\p{L})[СCсc]-\d{4}-\d{5,9}/gu],
  ["recordBook", /\d{2}-\p{Lu}{1,5}-\d{3,5}/gu],
  ["email", /[\p{L}\d._%+-]+@[\p{L}\d.-]+\.\p{L}{2,}/gu],
  ["link", /(?:https?:\/\/|www\.)\S+/giu],
  ["phone", /(?:\+7|(?<!\d)8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\d)/gu],
  ["group", /(?<![\p{L}\d])\d\p{Lu}{1,5}-\d(?![\p{L}\d])/gu],
  ["digits", /\d{6,}/gu],
];

/** Падежные окончания коротких имён на гласную: «Вера» → Веры, Вере, Веру, Верой; «Илья» → Ильи, Ильёй. */
const VOWEL_ENDINGS = "(?:а|я|ы|и|е|у|ю|ой|ей|ёй|ою|ею|ёю)?";

/**
 * Основа имени для поиска в падежах: «Игорь» → «Игор» (Игоря, Игорю, Игорем), «Савельев» → «Савель».
 * Короткие (до 4 букв) на согласную — целиком, окончание не длиннее 2 букв: иначе «Ян» задел бы «январь».
 * Короткие на гласную — без неё и только с падежным окончанием: «Вер» + «а/ы/ой…», но не «верный».
 * «е» и «ё» — одна буква (T14, оценка «глазами жюри»: «Королева» проходила мимо «Королёва»).
 */
function nameRegex(word: string): RegExp | null {
  const w = word.trim();
  if (w.length < 2) return null;
  const shortVowel = w.length <= 4 && w.length >= 3 && /[аяеёиоуыэюь]$/iu.test(w);
  const stem = shortVowel
    ? w.slice(0, -1)
    : w.length <= 4
      ? w
      : w.slice(0, Math.max(4, w.length - 2));
  const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[её]/giu, "[её]");
  const tail = shortVowel ? VOWEL_ENDINGS : `\\p{L}{0,${w.length <= 4 ? 2 : 4}}`;
  return new RegExp(`(?<!\\p{L})${escaped}${tail}(?!\\p{L})`, "giu");
}

export type Redaction = { text: string; removed: RemovedKind[] };

/** Убирает из текста личное: имя студента (в падежах), номера, контакты, ссылки → «…». */
export function redactPersonal(
  text: string,
  person: { lastName?: string; firstName?: string; middleName?: string | null } = {},
): Redaction {
  const removed = new Set<RemovedKind>();
  let out = text;
  for (const [kind, re] of PATTERNS) {
    out = out.replace(re, () => {
      removed.add(kind);
      return MASK;
    });
  }
  for (const part of [person.lastName, person.firstName, person.middleName]) {
    const re = part ? nameRegex(part) : null;
    if (!re) continue;
    out = out.replace(re, () => {
      removed.add("name");
      return MASK;
    });
  }
  // Обращение в начале («Игорь, справка готова») → «Справка готова»: многоточие в начале ответа ни к чему
  out = out.replace(/^(?:…[\s,]*)+/u, "");
  out = out.charAt(0).toUpperCase() + out.slice(1);
  return { text: out, removed: [...removed] };
}

const STOP = new Set(
  "который которые потому чтобы если когда тогда также можно нужно будет этого этому через после перед всего очень только справку справки справка готова готово деканат деканата сделали делаем".split(
    " ",
  ),
);

/** Ключевые слова для поиска помощника: название справки + частые слова ответа (от 5 букв). */
export function suggestKeywords(typeTitle: string, body: string, max = 6): string {
  const counts = new Map<string, number>();
  for (const w of body
    .toLowerCase()
    .replaceAll("ё", "е")
    .match(/\p{L}{5,}/gu) ?? []) {
    if (!STOP.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const words = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w);
  return [typeTitle.toLowerCase(), ...words].join(", ");
}

/** Черновик записи из ответа сотрудника на заявку. Вопрос сотрудник переформулирует сам. */
export function draftFromRequest(r: {
  typeTitle: string;
  comment: string;
  student: { lastName: string; firstName: string; middleName: string | null };
}): { title: string; keywords: string; body: string; removed: RemovedKind[] } {
  const red = redactPersonal(r.comment, r.student);
  return {
    title: `Справка «${r.typeTitle}»: `.slice(0, 120),
    keywords: suggestKeywords(r.typeTitle, red.text),
    body: red.text,
    removed: red.removed,
  };
}

export const FAQ_TITLE_MAX = 120;
export const FAQ_KEYWORDS_MAX = 300;
export const FAQ_BODY_MAX = 2000;

export const faqEntryIdSchema = z.string().regex(/^[a-z0-9-]{1,40}$/);

export const faqEntryFormSchema = z.object({
  id: faqEntryIdSchema,
  title: z
    .string({ error: "Сформулируйте вопрос" })
    .trim()
    .min(10, "Сформулируйте вопрос так, как спросил бы студент")
    .max(FAQ_TITLE_MAX, `Не длиннее ${FAQ_TITLE_MAX} символов`),
  keywords: z
    .string({ error: "Добавьте ключевые слова" })
    .trim()
    .min(3, "Добавьте ключевые слова — по ним помощник найдёт ответ")
    .max(FAQ_KEYWORDS_MAX, `Не длиннее ${FAQ_KEYWORDS_MAX} символов`),
  body: z
    .string({ error: "Напишите ответ" })
    .trim()
    .min(20, "Ответ слишком короткий — студенту нужен понятный ответ")
    .max(FAQ_BODY_MAX, `Не длиннее ${FAQ_BODY_MAX} символов`),
  intent: z.enum(["save", "publish", "unpublish"]),
});
export type FaqEntryForm = z.infer<typeof faqEntryFormSchema>;

export const readFaqEntryForm = (fd: FormData) => ({
  id: fd.get("id") ?? undefined,
  title: fd.get("title") ?? undefined,
  keywords: fd.get("keywords") ?? undefined,
  body: fd.get("body") ?? undefined,
  intent: fd.get("intent") ?? undefined,
});

/** В каком поле личное — ошибку ставим у него (ux-reviewer, T14+): сначала ответ, потом вопрос, потом слова. */
export function personalField(
  f: Pick<FaqEntryForm, "title" | "keywords" | "body">,
  person: { lastName: string; firstName: string; middleName: string | null } | null,
): "title" | "keywords" | "body" | null {
  for (const key of ["body", "title", "keywords"] as const)
    if (redactPersonal(f[key], person ?? {}).removed.length) return key;
  return null;
}

/** Перед публикацией: что из личного всё ещё в тексте (по шаблонам и по имени студента-источника). */
export function personalLeft(
  f: Pick<FaqEntryForm, "title" | "keywords" | "body">,
  person: { lastName: string; firstName: string; middleName: string | null } | null,
): RemovedKind[] {
  const all = [f.title, f.keywords, f.body].join("\n");
  return redactPersonal(all, person ?? {}).removed;
}

/** «Ответ деканата от 11 ноября» — подпись под ответом помощника. */
const DAY_MONTH = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: "Europe/Moscow",
});
const DAY_MONTH_YEAR = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Moscow",
});
const mskYear = (d: Date) =>
  new Intl.DateTimeFormat("ru-RU", { year: "numeric", timeZone: "Europe/Moscow" }).format(d);

/** Прошлый год — с годом: в январе «от 11 ноября» было бы неоднозначно (ux-reviewer, T14+). */
export const deanAnswerCaption = (publishedAt: Date, now: Date = new Date()) =>
  `Ответ деканата от ${
    mskYear(publishedAt) === mskYear(now)
      ? DAY_MONTH.format(publishedAt)
      : DAY_MONTH_YEAR.format(publishedAt).replace(/\s?г\.$/, "")
  }`;
