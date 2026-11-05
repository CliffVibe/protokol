// Демо-аккаунты для кнопок «Войти как…» на /login (только при DEMO_MODE=1, docs/06-seed-data.md).
// Без паролей: пароли — только в .env (SEED_PASSWORD_*) и в комментарии к работе для жюри.
// Совпадение логинов с сидом (prisma/seed-data.ts → DEMO) держит tests/unit/demo-accounts.test.ts.

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

/** 6 сценариев из docs/01-concept.md — подсказка жюри, под кем что проверять. */
export const DEMO_SCENARIOS: readonly { title: string; how: string }[] = [
  {
    title: "Утро",
    how: "Алиса → «Сейчас»: ближайшая пара, перенос, ближайший дедлайн.",
  },
  {
    title: "Как дела с учёбой",
    how: "Тимур → «Учёба»: средний балл, задолженность, стипендия под угрозой.",
  },
  {
    title: "Справка для визы",
    how: "Тимур → «Заявки» → «Зачем нужна справка?» → «Для визы».",
  },
  {
    title: "Деканат обработал",
    how: "Ирина → заявка в работе → «Готова»; затем студент видит уведомление.",
  },
  {
    title: "Проверка подлинности",
    how: "QR-код на справке открывает страницу проверки без входа.",
  },
  {
    title: "Изоляция",
    how: "Под Тимуром подставьте в адрес номер заявки Алисы — будет «Не найдено».",
  },
];
