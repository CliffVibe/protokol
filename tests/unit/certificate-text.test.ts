import { describe, expect, it } from "vitest";
import { certificateTitleEn, facultyNameEn } from "@/lib/certificate-en";
import { holderInitials } from "@/lib/initials";
import { translitIcao } from "@/lib/translit";
import { verifyTokenSchema } from "@/lib/verify-token";

describe("транслитерация ICAO 9303 (как в загранпаспорте)", () => {
  it.each([
    ["Петрова Алиса Сергеевна", "Petrova Alisa Sergeevna"],
    ["Юлия Щукина", "Iuliia Shchukina"],
    ["Хабибуллин Тимур", "Khabibullin Timur"],
    ["Ёлкин Ъ Ь", "Elkin Ie "],
    ["Цой Жанна", "Tsoi Zhanna"],
    ["3МО-1", "3MO-1"],
  ])("%s → %s", (ru, en) => expect(translitIcao(ru)).toBe(en));
});

describe("инициалы для /verify (S7)", () => {
  it("фамилия и первые буквы — без полного имени", () => {
    const name = { lastName: "Петрова", firstName: "Алиса", middleName: "Сергеевна" };
    expect(holderInitials(name)).toBe("Петрова А. С.");
    expect(holderInitials(name, true)).toBe("Petrova A. S.");
    expect(holderInitials(name)).not.toContain("Алиса");
  });

  it("без отчества и с «Ю» в латинице", () => {
    expect(holderInitials({ lastName: "Ким", firstName: "Юна", middleName: null })).toBe("Ким Ю.");
    expect(holderInitials({ lastName: "Ким", firstName: "Юна", middleName: " " }, true)).toBe(
      "Kim I.",
    );
  });
});

describe("токен проверки", () => {
  it("ровно 22 символа base64url", () => {
    expect(verifyTokenSchema.safeParse("AAAAAAAAAAAAAAAAAAAA-_").success).toBe(true);
    for (const bad of [
      "",
      "short",
      "A".repeat(23),
      "AAAAAAAAAAAAAAAAAAAA%2",
      "../../etc/passwd/aaaa",
    ])
      expect(verifyTokenSchema.safeParse(bad).success).toBe(false);
  });
});

describe("английские тексты справки", () => {
  it("факультет по коду; неизвестный — русское название", () => {
    expect(facultyNameEn("МЭО", "x")).toBe("School of International Economic Relations");
    expect(facultyNameEn("??", "Факультет")).toBe("Факультет");
    expect(certificateTitleEn("study_en")).toBe("Certificate of Enrolment");
    expect(certificateTitleEn("unknown")).toBe("Certificate");
  });
});
