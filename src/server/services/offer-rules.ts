import { formatDayMonth, plural } from "@/lib/dates";
import type { StudySummary } from "./academics";

// «Вам положено» (T14): деканат сам предлагает услугу, когда студент проходит правило по своим данным,
// — как беззаявительные услуги Госуслуг и проактивные гранты Georgia State (docs/process/research-ideas-T14.md).
// Чистые функции: данные приходят снаружи (из repos с ctx). Три правила — у каждого демо-студента своё
// (оценка «глазами жюри», 12.11: «главная мысль живёт в одной карточке у одного студента»).

export const OFFER_CODES = ["scholarship_up", "retake", "first_year_study"] as const;
export type OfferCode = (typeof OFFER_CODES)[number];

/**
 * Повышенная стипендия за успехи в учёбе: только «отлично» не меньше двух сессий подряд — так этот
 * критерий и устроен в вузах. Раньше было «средний рейтинг от 80» — оценка «глазами жюри» (T14) заметила,
 * что за рейтинг её не дают. Решение всё равно за стипендиальной комиссией: деканат лишь подсказывает.
 */
export const SCHOLARSHIP_UP_MIN_SESSIONS = 2;

/** Что известно о студенте для правил: учёба (null — оценок ещё нет) и курс группы. */
export type OfferSubject = { study: StudySummary | null; course: number | null };

export type Offer = {
  code: OfferCode;
  /** Тип заявки, которую создаёт «Подать заявление» */
  typeCode: string;
  /** Заголовок карточки */
  headline: string;
  /** Почему положено — словами, по данным самого студента */
  why: string;
  /** Чем заполнена заявка — значения полей типа (их проверяет та же zod-схема, что и форму) */
  payload: Record<string, string>;
  /** Подпись главной кнопки */
  action: string;
};

type Rule = {
  code: OfferCode;
  typeCode: string;
  action: string;
  check(s: OfferSubject): Omit<Offer, "code" | "typeCode" | "action"> | null;
};

const RULES: Rule[] = [
  {
    code: "scholarship_up",
    typeCode: "scholarship_up",
    action: "Подать заявление",
    check: ({ study: s }) =>
      s && s.excellentSessions >= SCHOLARSHIP_UP_MIN_SESSIONS && s.debts === 0 && s.scholarship.kept
        ? {
            headline: "Вы подходите на повышенную стипендию за успехи в учёбе",
            why: `${s.excellentSessions} ${plural(s.excellentSessions, ["сессия", "сессии", "сессий"])} подряд только на «отлично», долгов нет. Заявление уже заполнено. Решает стипендиальная комиссия.`,
            payload: {},
          }
        : null,
  },
  {
    // Долг с назначенной пересдачей: без заявления студента не внесут в ведомость — деканат заполнил его сам
    code: "retake",
    typeCode: "retake",
    action: "Подать заявление",
    check: ({ study: s }) => {
      const debt = s?.firstDebt;
      if (!debt) return null;
      return {
        headline: `Заявление на пересдачу: ${debt.discipline}`,
        why: debt.retakeAt
          ? `Пересдача назначена на ${formatDayMonth(debt.retakeAt)}. Чтобы вас внесли в ведомость, нужно заявление — деканат его уже заполнил.`
          : "Долг пока без даты пересдачи. Заявление уже заполнено — после него деканат назначит дату и комиссию.",
        payload: { discipline: debt.discipline },
      };
    },
  },
  {
    // Первокурснику в первые месяцы справку об обучении просят чаще всего: льготы и пособия семьи,
    // работа родителей. «По месту требования» — обычная формулировка, когда адресатов несколько
    code: "first_year_study",
    typeCode: "study_ru",
    action: "Заказать справку",
    check: ({ course }) =>
      course === 1
        ? {
            headline: "Вам может пригодиться справка об обучении",
            why: "В первом семестре её чаще всего просят — для льгот и пособий семьи и по месту работы родителей. Заявка «по месту требования» уже заполнена, срок — 2 рабочих дня.",
            payload: { addressee: "По месту требования" },
          }
        : null,
  },
];

/**
 * Предложения студенту. Не предлагаем, если заявка этого типа уже есть (кроме отменённой и отклонённой)
 * или студент нажал «Не сейчас» в этом семестре.
 */
export function offersFor(
  subject: OfferSubject,
  takenTypeCodes: ReadonlySet<string>,
  dismissedCodes: ReadonlySet<string>,
): Offer[] {
  return RULES.flatMap((r) => {
    if (takenTypeCodes.has(r.typeCode) || dismissedCodes.has(r.code)) return [];
    const hit = r.check(subject);
    return hit ? [{ code: r.code, typeCode: r.typeCode, action: r.action, ...hit }] : [];
  });
}

export const offerTypeCodes = () => RULES.map((r) => r.typeCode);

/**
 * Семестр для «Не сейчас», когда оценок ещё нет (первокурсник): осень (сентябрь–январь) — нечётный.
 */
export function semesterOf(subject: OfferSubject, now: Date): number | null {
  if (subject.study) return subject.study.semester;
  if (subject.course === null) return null;
  const month = Number(
    new Intl.DateTimeFormat("en-US", { month: "numeric", timeZone: "Europe/Moscow" }).format(now),
  );
  const autumn = month >= 9 || month === 1;
  return subject.course * 2 - (autumn ? 1 : 0);
}

/**
 * Дедлайн подачи заявления, у которого есть правило (ссылка `/requests/new?type=<код>`), показываем
 * только тем, кто под правило подходит: Тимуру с долгом «дедлайн повышенной стипендии» — промах для
 * кабинета, который «знает меня» (оценка «глазами жюри», 12.11). Без правила — всем, как раньше.
 */
export function deadlineRelevant(link: string | null, subject: OfferSubject): boolean {
  const typeCode = link?.startsWith("/requests/new")
    ? new URL(link, "http://local").searchParams.get("type")
    : null;
  const rules = typeCode ? RULES.filter((r) => r.typeCode === typeCode) : [];
  if (!rules.length) return true;
  return rules.some((r) => r.check(subject) !== null);
}
