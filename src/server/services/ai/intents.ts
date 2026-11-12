import "server-only";
import { ASSESSMENT_KIND } from "@/components/grades/labels";
import { toActions, type AssistantAction } from "@/lib/assistant-actions";
import { formatDayMonth, formatInDays } from "@/lib/dates";
import { mskStartOfDay } from "@/lib/msk";
import { scholarshipTitle } from "@/lib/scholarship";
import { lessonLine, requestLine, type StudentContext } from "./context";
import { normalize, stems } from "./faq";

// Правила без ИИ (T12): отказ «о другом человеке» и ответы о СВОИХ данных по простым признакам.
// Работают в обоих режимах: отказ — всегда до модели (детерминированно, тест не зависит от GigaChat),
// ответы о данных — когда ИИ нет (нет ключа, лимит, сбой). Чистые функции над StudentContext.

export type RuleAnswer = { text: string; actions: AssistantAction[] };

export const REFUSAL =
  "Я отвечаю только о ваших данных — расписании, оценках и заявках. О других студентах рассказать не могу: их данных у меня нет. Могу помочь с вашими делами или с правилами деканата.";

/** О ком-то другом: прямые слова или «данные + чьё-то имя». */
const OTHER_PERSON =
  /(друго(го|й)\s+студент|чуж(ие|ой|ая|их)|одногруппни|однокурсни|сосед[аук]?\s|соседк|(мо(его|ей)\s+)?(друга|подруги)(?![а-я])|всех\s+студентов|список\s+(групп|студентов)|других\s+студентов|кого-?то\s+другого)/u;
const DATA_WORD =
  /^(оценк|балл|баллы|рейтинг|долг|долги|задолженност|заявк|справк|стипенд|расписани|зачетк|пары|успеваемост|данные|экзамен)/u;
/** Имя после слова о данных: «оценки Тимура», «заявки Галиева Тимура». */
const NAME = /^[А-ЯЁ][а-яё]{2,}$/u;

export function asksAboutOtherPerson(
  question: string,
  c: Pick<StudentContext, "firstName" | "current" | "lessons">,
): boolean {
  const q = normalize(question);
  if (OTHER_PERSON.test(q)) return true;
  // Слова, которые законно пишут с заглавной: своё имя, дисциплины, корпуса и преподаватели из контекста
  const own = new Set(
    [
      c.firstName,
      ...c.current.map((g) => g.discipline.name),
      ...c.lessons.flatMap((l) => [l.discipline.name, l.teacher.fullName, l.building]),
    ].flatMap((s) => stems(s)),
  );
  const words = question.split(/[^А-Яа-яЁё-]+/u).filter(Boolean);
  for (let i = 0; i < words.length - 1; i++) {
    const w = normalize(words[i] ?? "");
    if (!DATA_WORD.test(w)) continue;
    // «оценки у Тимура», «оценки Тимура»
    let j = i + 1;
    if (words[j]?.toLowerCase() === "у") j++;
    const name = words[j];
    if (name && NAME.test(name) && !stems(name).some((s) => own.has(s))) return true;
  }
  return false;
}

// В JS граница слова (обратный слеш + b) — только для латиницы, поэтому для кириллицы — (?<![а-я]) и (?![а-я]).
/** «Как подписаться…», «как отменить…» — вопрос о правилах, а не о данных: его ведёт FAQ. */
const HOW_TO = /(?<![а-я])как(?![а-я])|подпис|календар|интернет|офлайн|отмен|подать|заказ/;
const has = (q: string, re: RegExp) => re.test(q);

/** Ответ о своих данных по признакам вопроса; null — правило не подошло (дальше FAQ). */
export function answerFromData(question: string, c: StudentContext): RuleAnswer | null {
  const q = normalize(question);

  if (has(q, /экзамен|зачет|сесси|контрол/) && has(q, /когда|следующ|ближайш|скоро|дат|какой/)) {
    const n = c.session?.next;
    if (!n) {
      return {
        text: "Дат ближайших экзаменов и зачётов в вашем плане пока нет. Деканат публикует их перед сессией — они появятся в «Учёбе» и придут уведомлением.",
        actions: toActions(["grades", "notifications"]),
      };
    }
    const kind = ASSESSMENT_KIND[n.kind].toLowerCase();
    return {
      text: `Ближайший контроль — ${kind} «${n.name}», ${formatDayMonth(n.at)} (${formatInDays(n.inDays)}).`,
      actions: toActions(["grades", "schedule_week"]),
    };
  }

  const howTo = has(q, HOW_TO);

  if (!howTo && has(q, /заявк/) && has(q, /мо[иеяй]|статус|что с|где|готов|сколько/)) {
    if (!c.requests.length) {
      return {
        text: "Активных заявок нет. Справку можно заказать в «Заявках» — мастер подскажет, какая нужна.",
        actions: toActions(["request_new", "requests"]),
      };
    }
    return {
      text: ["Ваши активные заявки:", ...c.requests.map((r) => `- ${requestLine(r)}`)].join("\n"),
      actions: toActions(["requests"]),
    };
  }

  if (!howTo && has(q, /((?<![а-я])пар[аыуе]?(?![а-я])|расписан|занят)/)) {
    const tomorrow = has(q, /завтра/);
    const day = mskStartOfDay(new Date(+mskStartOfDay(c.now) + (tomorrow ? 36 : 12) * 3_600_000));
    const dayLessons = c.lessons.filter((l) => +mskStartOfDay(l.startsAt) === +day);
    const asked = tomorrow || has(q, /сегодн/);
    if (asked) {
      const label = tomorrow ? "Завтра" : "Сегодня";
      return {
        text: dayLessons.length
          ? [`${label}:`, ...dayLessons.map((l) => `- ${lessonLine(l, c.now)}`)].join("\n")
          : `${label} пар нет.`,
        actions: toActions(["schedule"]),
      };
    }
    const next = c.lessons[0];
    return {
      text: next ? `Ближайшая пара: ${lessonLine(next, c.now)}.` : "В ближайшую неделю пар нет.",
      actions: toActions(["schedule", "schedule_week"]),
    };
  }

  if (
    !howTo &&
    has(q, /долг|задолж|стипенд/) &&
    has(q, /у меня|мне|мо[йяеи]|(?<![а-я])я(?![а-я])|есть ли|сохран/)
  ) {
    const s = c.study;
    if (!s) return null;
    const debts = s.debts
      ? `Долгов за прошлые семестры: ${s.debts}. Пересдачу назначает деканат.`
      : "Долгов за прошлые семестры нет.";
    const scholarship = s.scholarship.kept
      ? "Стипендия на следующий семестр сохраняется."
      : [`${scholarshipTitle(s.scholarship)}:`, ...s.scholarship.reasons.map((r) => `- ${r}`)].join(
          "\n",
        );
    return { text: `${debts}\n\n${scholarship}`, actions: toActions(["grades", "what_if"]) };
  }

  return null;
}
