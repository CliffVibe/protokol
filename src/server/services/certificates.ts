import "server-only";
import { z } from "zod";
import { certificateTitleEn, facultyNameEn, FIELD_LABEL_EN } from "@/lib/certificate-en";
import { translitIcao } from "@/lib/translit";
import type { StudentCtx } from "@/server/auth/guards";
import { verifyUrl } from "@/server/app-url";
import type { CertificateData } from "@/server/pdf/certificate";
import { documentForPdf, type PdfSource } from "@/server/repos/requests";
import { parseFields } from "./request-rules";

// Справка в PDF (T10): данные — только из своей заявки (repos/requests.documentForPdf, S1).
// Здесь — только сборка строк документа; рисует src/server/pdf/certificate.tsx.

const payloadRecord = z.record(z.string(), z.string());

function payloadRows(src: PdfSource, lang: "ru" | "en") {
  const fields = parseFields(src.type.fields) ?? [];
  const values = payloadRecord.safeParse(src.payload);
  if (!values.success) return [];
  return fields
    .filter((f) => values.data[f.name])
    .map((f) => ({
      label: lang === "en" ? (FIELD_LABEL_EN[f.name] ?? f.label) : f.label,
      value: values.data[f.name]!,
    }));
}

export function certificateData(src: PdfSource): CertificateData | null {
  const doc = src.document;
  if (!doc) return null;
  const lang = src.language === "en" ? "en" : "ru";
  const st = src.student;
  const g = st.group;
  const faculty = g.program.faculty;
  const base = {
    language: lang,
    number: src.number,
    issuedAt: doc.issuedAt,
    validUntil: doc.validUntil,
    verifyUrl: verifyUrl(doc.verifyToken),
  } as const;

  if (lang === "en") {
    // Фамилия капсом — как в машиночитаемой зоне загранпаспорта
    const name = [
      translitIcao(st.lastName).toUpperCase(),
      translitIcao(st.firstName),
      st.middleName ? translitIcao(st.middleName) : null,
    ]
      .filter(Boolean)
      .join(" ");
    return {
      ...base,
      title: certificateTitleEn(src.type.code),
      office: facultyNameEn(faculty.code, faculty.name),
      rows: [
        { label: "Student", value: name },
        { label: "Year of study", value: String(g.course) },
        { label: "Mode of study", value: "Full-time" },
        { label: "Faculty", value: facultyNameEn(faculty.code, faculty.name) },
        { label: "Group", value: translitIcao(g.name) },
        ...payloadRows(src, "en"),
      ],
    };
  }

  return {
    ...base,
    title: src.type.title,
    office: faculty.name,
    rows: [
      {
        label: "Обучающийся",
        value: [st.lastName, st.firstName, st.middleName].filter(Boolean).join(" "),
      },
      { label: "Курс", value: String(g.course) },
      { label: "Форма обучения", value: "очная" },
      { label: "Факультет", value: faculty.name },
      { label: "Направление подготовки", value: g.program.name },
      { label: "Группа", value: g.name },
      ...payloadRows(src, "ru"),
    ],
  };
}

/** Своя готовая справка → данные PDF; иначе null (→ 404). */
export async function getMyCertificate(ctx: StudentCtx, number: string) {
  const src = await documentForPdf(ctx, number);
  return src ? certificateData(src) : null;
}

/** Имя файла: латиница (номер «С-2026-00042» → «S-2026-00042») — без сюрпризов в любом браузере. */
export const certificateFileName = (number: string) =>
  `spravka-${number.replace(/^С/, "S").replace(/[^A-Za-z0-9-]/g, "")}.pdf`;
