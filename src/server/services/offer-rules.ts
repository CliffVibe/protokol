import { plural } from "@/lib/dates";
import type { StudySummary } from "./academics";

// «Вам положено» (T14): деканат сам предлагает услугу, когда студент проходит правило по своим данным,
// — как беззаявительные услуги Госуслуг и проактивные гранты Georgia State (docs/process/research-ideas-T14.md).
// Правила условные для демо — на экране это сказано. Чистые функции: данные приходят снаружи (из repos с ctx).

export const OFFER_CODES = ["scholarship_up"] as const;
export type OfferCode = (typeof OFFER_CODES)[number];

/**
 * Повышенная стипендия за успехи в учёбе: только «отлично» не меньше двух сессий подряд — так этот
 * критерий и устроен в вузах. Раньше было «средний рейтинг от 80» — оценка «глазами жюри» (T14) заметила,
 * что за рейтинг её не дают. Решение всё равно за стипендиальной комиссией: деканат лишь подсказывает.
 */
export const SCHOLARSHIP_UP_MIN_SESSIONS = 2;

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
    title: "повышенную стипендию за успехи в учёбе",
    check: (s) =>
      s.excellentSessions >= SCHOLARSHIP_UP_MIN_SESSIONS && s.debts === 0 && s.scholarship.kept
        ? `${s.excellentSessions} ${plural(s.excellentSessions, ["сессия", "сессии", "сессий"])} подряд только на «отлично», долгов нет. Решает стипендиальная комиссия.`
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
