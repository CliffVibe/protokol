import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONCEPT_NOTICE } from "@/components/concept-banner";

describe("ConceptBanner", () => {
  it("текст плашки совпадает с правилом из CLAUDE.md", () => {
    const rules = readFileSync("CLAUDE.md", "utf8");
    expect(rules).toContain(`«${CONCEPT_NOTICE}»`);
  });

  it("упоминает, что сервис не официальный и данные вымышлены", () => {
    expect(CONCEPT_NOTICE).toMatch(/Не является официальным сервисом МГИМО/);
    expect(CONCEPT_NOTICE).toMatch(/Все данные вымышлены/);
  });
});
