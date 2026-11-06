import { describe, expect, it } from "vitest";
import { renderCertificate, type CertificateData } from "@/server/pdf/certificate";
import { certificateData, certificateFileName } from "@/server/services/certificates";
import type { PdfSource } from "@/server/repos/requests";
import { pdfContains } from "./pdf-text";

// Справка в PDF (T10): кириллица действительно отрисована (встроенные шрифты PDF её не умеют —
// без Font.register текст пропал бы), английская версия — латиницей, номера зачётки и оценок нет.

const source = (over: Partial<PdfSource> = {}): PdfSource => ({
  number: "С-2026-00042",
  language: "ru",
  payload: { addressee: "По месту требования" },
  type: {
    code: "study_ru",
    title: "Справка об обучении",
    fields: [
      {
        name: "addressee",
        label: "Куда предоставляется",
        type: "text",
        required: true,
        maxLength: 120,
      },
    ],
  },
  student: {
    lastName: "Петрова",
    firstName: "Алиса",
    middleName: "Сергеевна",
    group: {
      name: "3МО-1",
      course: 3,
      program: {
        name: "Международные отношения",
        faculty: { code: "ФМО", name: "Факультет международных отношений" },
      },
    },
  },
  document: {
    verifyToken: "AAAAAAAAAAAAAAAAAAAAAA",
    issuedAt: new Date("2026-11-05T13:20:00Z"),
    validUntil: new Date("2027-02-03T13:20:00Z"),
  },
  ...over,
});

describe("PDF справки", () => {
  it("русская: есть «Справка», ФИО и QR-адрес проверки", async () => {
    const data = certificateData(source())!;
    const pdf = await renderCertificate(data);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdfContains(pdf, "Справка")).toBe(true);
    expect(pdfContains(pdf, "Петрова Алиса Сергеевна")).toBe(true);
    expect(pdfContains(pdf, "/verify/AAAAAAAAAAAAAAAAAAAAAA")).toBe(true);
    expect(pdfContains(pdf, "ОБРАЗЕЦ")).toBe(true);
    // Положительный контроль разборщика: несуществующего текста он «не находит»
    expect(pdfContains(pdf, "Зачётная книжка")).toBe(false);
  }, 30_000);

  it("английская: заголовок и имя латиницей по ICAO", async () => {
    const data = certificateData(
      source({
        language: "en",
        type: { code: "study_en", title: "Справка об обучении на английском", fields: [] },
      }),
    )!;
    expect(data.title).toBe("Certificate of Enrolment");
    const pdf = await renderCertificate(data);
    expect(pdfContains(pdf, "Certificate of Enrolment")).toBe(true);
    expect(pdfContains(pdf, "PETROVA Alisa Sergeevna")).toBe(true);
    expect(pdfContains(pdf, "School of International Relations")).toBe(true);
  }, 30_000);

  it("несколько справок подряд в одном процессе — текстовый слой не теряет буквы", async () => {
    // Регрессия T10: кэш глифов fontkit переживал документ, и латиница после кириллицы уходила
    // из ToUnicode (выглядит верно, а поиск и копирование — «Certi cate», «dean s».
    const en = certificateData(
      source({ language: "en", type: { code: "study_en", title: "x", fields: [] } }),
    )!;
    const ru = certificateData(source())!;
    for (const [data, text] of [
      [ru, "Петрова Алиса Сергеевна"],
      [en, "Protokol — a digital dean's office concept"],
      [ru, "Факультет международных отношений"],
      [en, "PETROVA Alisa Sergeevna"],
    ] as const) {
      expect(pdfContains(await renderCertificate(data), text)).toBe(true);
    }
  }, 60_000);

  it("весь текст — встроенными PT Sans / PT Serif, не стандартным Helvetica без кириллицы", async () => {
    const pdf = (await renderCertificate(certificateData(source())!)).toString("latin1");
    const fonts = [...pdf.matchAll(/\/BaseFont \/([A-Za-z+-]+)/g)].map((m) => m[1]);
    expect(fonts.length).toBeGreaterThan(0);
    for (const f of fonts) expect(f).toMatch(/\+PT(Sans|Serif)-/);
  }, 30_000);

  it("в строках справки нет номера зачётки и оценок — их нет и в источнике", () => {
    const data: CertificateData = certificateData(source())!;
    const labels = data.rows.map((r) => r.label.toLowerCase()).join(" ");
    expect(labels).not.toMatch(/зачёт|оценк|рейтинг/);
    expect(Object.keys(source().student)).not.toContain("recordBookNo");
  });

  it("без документа — null", () => {
    expect(certificateData(source({ document: null }))).toBeNull();
  });

  it("имя файла — латиница", () => {
    expect(certificateFileName("С-2026-00042")).toBe("spravka-S-2026-00042.pdf");
  });
});
