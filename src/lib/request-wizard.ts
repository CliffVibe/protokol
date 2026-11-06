// Мастер «Зачем нужна справка?» (T10): цель → подходящие справки → язык → форма.
// Чистые функции без БД (юнит-тесты — tests/unit/request-wizard.test.ts). Шаг задают GET-параметры:
// мастер работает без JS, «назад» браузера — на предыдущий шаг. Битые параметры — первый шаг, не 500.
import type { Route } from "next";
import { z } from "zod";

export const PURPOSES = [
  { code: "visa", label: "Виза", hint: "Посольство или визовый центр" },
  { code: "military", label: "Военкомат", hint: "Отсрочка на время учёбы" },
  { code: "work", label: "Работа", hint: "Работодателю или по месту работы родителей" },
  { code: "social", label: "Соцзащита", hint: "Льготы, пособия, субсидии" },
  { code: "internship", label: "Стажировка", hint: "Стажировка, обмен, зарубежный вуз" },
  { code: "other", label: "Другое", hint: "Перевод в другой вуз и всё остальное" },
] as const;

export type Purpose = (typeof PURPOSES)[number];
export type PurposeCode = Purpose["code"];

const PURPOSE_CODES = PURPOSES.map((p) => p.code) as [PurposeCode, ...PurposeCode[]];

/** Параметры мастера: каждый проверяется отдельно, битый (или массив) — как будто его нет. */
const wizardParamsSchema = z.object({
  purpose: z.enum(PURPOSE_CODES).optional().catch(undefined),
  type: z
    .string()
    .regex(/^[a-z_]{1,40}$/)
    .optional()
    .catch(undefined),
  lang: z
    .string()
    .regex(/^[a-z]{2}$/)
    .optional()
    .catch(undefined),
  all: z.literal("1").optional().catch(undefined),
});

export type WizardParams = z.infer<typeof wizardParamsSchema>;

export function parseWizardParams(raw: unknown): WizardParams {
  const parsed = wizardParamsSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

type WizardType = { code: string; languages: string[]; purposeTags: string[] };

export type WizardStep<T extends WizardType> =
  | { kind: "purpose" }
  | { kind: "catalog" }
  | { kind: "types"; purpose: Purpose; types: T[] }
  | { kind: "language"; purpose: Purpose | null; type: T; recommended: string | null }
  | { kind: "form"; purpose: Purpose | null; type: T; language: string };

/** Язык, который советуем для цели: для визы просят английский. */
export function recommendedLanguage(purpose: Purpose | null, type: WizardType): string | null {
  return purpose?.code === "visa" && type.languages.includes("en") ? "en" : null;
}

/**
 * Справки под цель. Для визы — сначала только-английские, потом с английским на выбор, потом прочие
 * (приёмка T10: «Виза» предлагает справку на английском). Внутри ранга — порядок каталога.
 */
export function typesForPurpose<T extends WizardType>(catalog: T[], purpose: PurposeCode): T[] {
  const rank = (t: T) =>
    purpose !== "visa"
      ? 0
      : t.languages[0] === "en" && t.languages.length === 1
        ? 0
        : t.languages.includes("en")
          ? 1
          : 2;
  return catalog
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.purposeTags.includes(purpose))
    .sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i)
    .map(({ t }) => t);
}

/** Языки для шага выбора: рекомендованный первым. */
export function languageOptions(type: WizardType, recommended: string | null): string[] {
  if (!recommended) return [...type.languages];
  return [recommended, ...type.languages.filter((l) => l !== recommended)];
}

export function resolveWizard<T extends WizardType>(p: WizardParams, catalog: T[]): WizardStep<T> {
  const purpose = PURPOSES.find((x) => x.code === p.purpose) ?? null;
  const type = p.type ? catalog.find((t) => t.code === p.type) : undefined;
  if (type) {
    const only = type.languages.length === 1 ? type.languages[0] : undefined;
    if (only) return { kind: "form", purpose, type, language: only };
    if (p.lang && type.languages.includes(p.lang))
      return { kind: "form", purpose, type, language: p.lang };
    if (type.languages.length > 1)
      return { kind: "language", purpose, type, recommended: recommendedLanguage(purpose, type) };
  }
  if (purpose) return { kind: "types", purpose, types: typesForPurpose(catalog, purpose.code) };
  if (p.all) return { kind: "catalog" };
  return { kind: "purpose" };
}

/** Адрес шага мастера. Порядок параметров постоянный — удобно сравнивать в тестах. */
export function wizardHref(p: WizardParams): Route {
  const q = new URLSearchParams();
  if (p.all) q.set("all", "1");
  if (p.purpose) q.set("purpose", p.purpose);
  if (p.type) q.set("type", p.type);
  if (p.lang) q.set("lang", p.lang);
  const s = q.toString();
  return (s ? `/requests/new?${s}` : "/requests/new") as Route;
}
