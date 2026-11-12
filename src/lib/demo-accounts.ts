// Демо-аккаунты для кнопок «Войти как…» на /login (только при DEMO_MODE=1, docs/06-seed-data.md).
// Без паролей: пароли — только в .env (SEED_PASSWORD_*) и в комментарии к работе для жюри.
// Совпадение логинов с сидом (prisma/seed-data.ts → DEMO) держит tests/unit/demo-accounts.test.ts.
import { addDays, mskStartOfDay, mskYear } from "@/lib/msk";

export const DEMO_LOGINS = [
  "student.alisa",
  "student.timur",
  "student.new",
  "staff.irina",
] as const;
export type DemoLogin = (typeof DEMO_LOGINS)[number];

export type DemoAccount = {
  login: DemoLogin;
  /** Короткое имя на кнопке: «Войти как Алиса». */
  name: string;
  /** Кто это — одной строкой под кнопкой. */
  about: string;
};

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { login: "student.alisa", name: "Алиса", about: "Студентка, ФМО, 2 курс" },
  { login: "student.timur", name: "Тимур", about: "Студент, МЭО, 4 курс" },
  { login: "student.new", name: "Вера", about: "Первокурсница, пока без оценок и заявок" },
  { login: "staff.irina", name: "Ирина", about: "Сотрудник деканата ФМО и МЭО" },
];

/**
 * Номер первой заявки Алисы в сиде («Справка об обучении на английском», подана 3 дня назад, seq 1 —
 * prisma/seed-data.ts → buildRequests). Сценарий «Изоляция» называет его прямо: оценка «глазами жюри» (T14)
 * просила не заставлять эксперта искать номер. Совпадение с сидом держит tests/unit/auth-pure.test.ts.
 */
export function alisaSampleRequestNumber(now: Date): string {
  return `С-${mskYear(addDays(mskStartOfDay(now), -3))}-00001`;
}

export type DemoScenario = { title: string; how: string };

/**
 * 6 сценариев для жюри (docs/01-concept.md) — ведут к тому, чем «Протокол» отличается, а не только к ядру
 * (T14, оценка «глазами жюри»: «сценарии на входе к главным идеям не ведут»).
 */
export function demoScenarios(now: Date): readonly DemoScenario[] {
  const number = alisaSampleRequestNumber(now);
  return [
    {
      title: "Деканат приходит сам",
      how: "Войдите как Алиса: на «Сейчас» — ближайшая пара, перенос с причиной и карточка «Деканат предлагает»: заявление на повышенную стипендию уже заполнено, подать — одним нажатием.",
    },
    {
      title: "Как дела с учёбой",
      how: "Войдите как Тимур и откройте «Учёба»: долг и пересдача, почему стипендия не назначена, «Что если сдать сессию…».",
    },
    {
      title: "Справка для визы",
      how: "Под Тимуром: «Заявки» → «Заказать справку» → «Виза». Срок виден до отправки, а QR на готовой справке открывает проверку подлинности без входа.",
    },
    {
      title: "Деканат работает с исключениями",
      how: "Войдите как Ирина: «Главное на сегодня» — что горит; отметьте заявки и выдайте пачкой с готовым ответом — студенты получат уведомления.",
    },
    {
      title: "Обратная связь",
      how: "Под Алисой оцените готовую справку, а в «Уведомлениях» → «Объявления» найдите ответ деканата с пометкой «Вы сказали — мы сделали».",
    },
    {
      title: "Изоляция",
      how: `Под Тимуром откройте адрес /requests/${number} — это заявка Алисы: будет «Такой заявки у вас нет» (404). Под Алисой тот же адрес открывается.`,
    },
  ];
}
