// Английские тексты справки (T10): названия факультетов, заголовки справок, подписи полей заявки.
// Нужны и PDF на английском, и странице проверки /verify. Названия факультетов — открытые реалии
// (CLAUDE.md → «Данные»); коды — как в сиде (prisma/seed-data.ts → FACULTIES, REQUEST_TYPES).
const FACULTY_EN: Record<string, string> = {
  ФМО: "School of International Relations",
  МП: "School of International Law",
  МЭО: "School of International Economic Relations",
  МЖ: "School of International Journalism",
  ФУП: "School of Governance and Politics",
  ФМБ: "School of International Business and Business Administration",
  МИЭП: "International Institute of Energy Policy and Diplomacy",
  ИМТУР: "Institute of International Trade and Sustainable Development",
};

/** Неизвестный код — русское название как есть (лучше, чем пустое место в справке). */
export function facultyNameEn(code: string, fallback: string): string {
  return FACULTY_EN[code] ?? fallback;
}

const TITLE_EN: Record<string, string> = {
  study_en: "Certificate of Enrolment",
  study_ru: "Certificate of Enrolment",
  embassy: "Certificate of Enrolment for a Visa Application",
  academic: "Academic Certificate",
  retake: "Re-examination Permit",
};

export const certificateTitleEn = (typeCode: string) => TITLE_EN[typeCode] ?? "Certificate";

/** Подписи полей заявки для английской справки (в описании типа они бывают по-русски). */
export const FIELD_LABEL_EN: Record<string, string> = {
  addressee: "Addressee",
  country: "Country",
  tripDates: "Travel dates",
  reason: "Purpose",
  period: "Period",
  host: "Host organisation",
  commissariat: "Military commissariat",
  office: "Social security office",
  discipline: "Course",
  comment: "Comment",
};
