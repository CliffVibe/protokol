import type { StudySummary } from "./academics";

// «Вам положено» (T14): деканат сам предлагает услугу, когда студент проходит правило по своим данным,
// — как беззаявительные услуги Госуслуг и проактивные гранты Georgia State (docs/process/research-ideas-T14.md).
// Правила ВЫМЫШЛЕННЫЕ (не МГИМО) — на экране это сказано. Чистые функции: данные приходят снаружи (из repos с ctx).

export const OFFER_CODES = ["scholarship_up"] as const;
export type OfferCode = (typeof OFFER_CODES)[number];

/** Порог повышенной стипендии в прототипе: средний рейтинг текущего семестра. */
export const SCHOLARSHIP_UP_MIN_AVERAGE = 80;

export type Offer = {
  code: OfferCode;
  /** Тип заявки, которую создаёт «Подать заявление» */
  typeCode: string;
  title: string;
  /** Почему положено — словами, по данным самого студента */
  why: string;
};

type Rule = {
  code: OfferCode;
  typeCode: string;
  title: string;
  check(s: StudySummary): string | null;
};

const RULES: Rule[] = [
  {
    code: "scholarship_up",
    typeCode: "scholarship_up",
    title: "повышенную академическую стипендию",
    check: (s) =>
      s.averageRating !== null &&
      s.averageRating >= SCHOLARSHIP_UP_MIN_AVERAGE &&
      s.debts === 0 &&
      s.scholarship.kept
        ? `Средний рейтинг за ${s.semester}-й семестр — ${s.averageRating} из 100, долгов нет.`
        : null,
  },
];

/**
 * Предложения студенту. Не предлагаем, если заявка этого типа уже есть (кроме отменённой и отклонённой)
 * или студент нажал «Не сейчас» в этом семестре.
 */
export function offersFor(
  study: StudySummary | null,
  takenTypeCodes: ReadonlySet<string>,
  dismissedCodes: ReadonlySet<string>,
): Offer[] {
  if (!study) return [];
  return RULES.flatMap((r) => {
    if (takenTypeCodes.has(r.typeCode) || dismissedCodes.has(r.code)) return [];
    const why = r.check(study);
    return why ? [{ code: r.code, typeCode: r.typeCode, title: r.title, why }] : [];
  });
}

export const offerTypeCodes = () => RULES.map((r) => r.typeCode);
