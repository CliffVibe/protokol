import { describe, expect, it } from "vitest";
import {
  languageOptions,
  parseWizardParams,
  resolveWizard,
  typesForPurpose,
  wizardHref,
} from "@/lib/request-wizard";

// Мастер «Зачем нужна справка?» (T10). Каталог — как в сиде (prisma/seed-data.ts → REQUEST_TYPES).
const CATALOG = [
  { code: "academic", languages: ["ru", "en"], purposeTags: ["other"] },
  { code: "embassy", languages: ["ru", "en"], purposeTags: ["visa"] },
  { code: "internship_app", languages: ["ru"], purposeTags: ["internship"] },
  { code: "military", languages: ["ru"], purposeTags: ["military"] },
  { code: "social", languages: ["ru"], purposeTags: ["social"] },
  { code: "scholarship", languages: ["ru"], purposeTags: ["social", "work"] },
  { code: "study_ru", languages: ["ru"], purposeTags: ["work", "other"] },
  { code: "study_en", languages: ["en"], purposeTags: ["visa", "internship", "work"] },
];

describe("параметры мастера", () => {
  it("битые и массивы — как будто их нет (первый шаг, не 500)", () => {
    expect(
      parseWizardParams({ purpose: "hack", type: "../x", lang: "english", all: "yes" }),
    ).toEqual({});
    expect(parseWizardParams({ purpose: ["visa", "work"] })).toEqual({});
    expect(parseWizardParams(null)).toEqual({});
    expect(parseWizardParams({ purpose: "visa", type: "embassy", lang: "en" })).toEqual({
      purpose: "visa",
      type: "embassy",
      lang: "en",
    });
  });

  it("адрес шага — с постоянным порядком параметров", () => {
    expect(wizardHref({})).toBe("/requests/new");
    expect(wizardHref({ lang: "en", type: "embassy", purpose: "visa" })).toBe(
      "/requests/new?purpose=visa&type=embassy&lang=en",
    );
  });
});

describe("шаги", () => {
  const step = (raw: Record<string, string>) => resolveWizard(parseWizardParams(raw), CATALOG);

  it("без параметров — выбор цели; ?all=1 — полный каталог", () => {
    expect(step({}).kind).toBe("purpose");
    expect(step({ all: "1" }).kind).toBe("catalog");
  });

  it("приёмка: «Виза» первой предлагает справку на английском", () => {
    const s = step({ purpose: "visa" });
    expect(s.kind).toBe("types");
    if (s.kind !== "types") return;
    expect(s.types.map((t) => t.code)).toEqual(["study_en", "embassy"]);
  });

  it("у других целей — порядок каталога", () => {
    expect(typesForPurpose(CATALOG, "work").map((t) => t.code)).toEqual([
      "scholarship",
      "study_ru",
      "study_en",
    ]);
  });

  it("справка с двумя языками — шаг языка, для визы английский рекомендован первым", () => {
    const s = step({ purpose: "visa", type: "embassy" });
    expect(s.kind).toBe("language");
    if (s.kind !== "language") return;
    expect(s.recommended).toBe("en");
    expect(languageOptions(s.type, s.recommended)).toEqual(["en", "ru"]);
  });

  it("без цели советуем по самой справке: визовая — английский первым (T13), прочие — без совета", () => {
    // Справка «для посольства» — только визовая; из полного каталога цель не выбрана, но совет тот же
    const visa = step({ type: "embassy" });
    expect(visa.kind === "language" && visa.recommended).toBe("en");
    const other = step({ type: "academic" });
    expect(other.kind === "language" && other.recommended).toBe(null);
  });

  it("дисциплина пересдачи — только формат id; битая отбрасывается, ссылка её сохраняет", () => {
    expect(parseWizardParams({ type: "retake", discipline: "dis-mf" })).toEqual({
      type: "retake",
      discipline: "dis-mf",
    });
    expect(parseWizardParams({ type: "retake", discipline: "<script>" })).toEqual({
      type: "retake",
    });
    expect(wizardHref({ type: "retake", discipline: "dis-mf" })).toBe(
      "/requests/new?type=retake&discipline=dis-mf",
    );
  });

  it("язык выбран — форма; язык, которого у справки нет, — снова выбор", () => {
    expect(step({ purpose: "visa", type: "embassy", lang: "en" })).toMatchObject({
      kind: "form",
      language: "en",
    });
    expect(step({ type: "embassy", lang: "de" }).kind).toBe("language");
  });

  it("справка с одним языком — сразу форма (старые ссылки ?type= из T08 работают)", () => {
    expect(step({ type: "study_ru" })).toMatchObject({ kind: "form", language: "ru" });
    expect(step({ type: "study_en", lang: "ru" })).toMatchObject({ kind: "form", language: "en" });
  });

  it("неизвестная справка с целью — список под цель; без цели — выбор цели", () => {
    expect(step({ purpose: "military", type: "nope" }).kind).toBe("types");
    expect(step({ type: "nope" }).kind).toBe("purpose");
  });
});
