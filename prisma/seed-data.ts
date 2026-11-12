// Вымышленные данные «Протокола» (docs/06-seed-data.md). Чистая функция без БД и без секретов:
// результат зависит только от `today` и фиксированного зерна — это проверяет tests/unit/seed-data.test.ts.
// Пароли сюда не попадают: у пользователя только имя переменной окружения (passwordEnv),
// хеш считает prisma/seed.ts. Случайные токены (.ics, QR) тоже генерирует seed.ts через crypto.
// Все люди, номера и оценки выдуманы. Названия факультетов и корпусов — открытые реалии (CLAUDE.md).
import type { Prisma } from "../src/generated/prisma/client";
import {
  addDays,
  mskAt,
  mskDateKey,
  mskStartOfDay,
  mskStartOfWeek,
  mskWeekday,
  mskYear,
} from "../src/lib/msk";

// ── Типы результата ──────────────────────────────────────────────────────

export type SeedUser = Omit<Prisma.UserCreateManyInput, "passwordHash"> & {
  /** Имя переменной с паролем (SEED_PASSWORD_*) или null — вход невозможен (фоновые студенты) */
  passwordEnv: string | null;
};
export type SeedStudent = Omit<Prisma.StudentCreateManyInput, "calendarToken">;
export type SeedIssuedDocument = Omit<Prisma.IssuedDocumentCreateManyInput, "verifyToken">;

export interface SeedData {
  faculties: Prisma.FacultyCreateManyInput[];
  programs: Prisma.ProgramCreateManyInput[];
  groups: Prisma.GroupCreateManyInput[];
  languageGroups: Prisma.LanguageGroupCreateManyInput[];
  users: SeedUser[];
  students: SeedStudent[];
  studentLanguageGroups: Prisma.StudentLanguageGroupCreateManyInput[];
  staff: Prisma.StaffCreateManyInput[];
  teachers: Prisma.TeacherCreateManyInput[];
  disciplines: Prisma.DisciplineCreateManyInput[];
  lessons: Prisma.LessonCreateManyInput[];
  grades: Prisma.GradeCreateManyInput[];
  requestTypes: Prisma.RequestTypeCreateManyInput[];
  requests: Prisma.RequestCreateManyInput[];
  requestEvents: Prisma.RequestEventCreateManyInput[];
  issuedDocuments: SeedIssuedDocument[];
  announcements: Prisma.AnnouncementCreateManyInput[];
  deadlines: Prisma.DeadlineCreateManyInput[];
  notifications: Prisma.NotificationCreateManyInput[];
  /** T14+: база знаний из заявок — ответы деканата, по которым отвечает помощник */
  faqEntries: Prisma.FaqEntryCreateManyInput[];
}

/** Аудитория объявления/дедлайна. Пустой объект — всем. */
export interface Audience {
  facultyCodes?: string[];
  courses?: number[];
  groupNames?: string[];
}

// ── Демо-аккаунты (логины публикуются жюри; пароли — только в env) ───────

export const DEMO = {
  alisa: {
    login: "student.alisa",
    userId: "usr-alisa",
    studentId: "stu-alisa",
    passwordEnv: "SEED_PASSWORD_ALISA",
  },
  timur: {
    login: "student.timur",
    userId: "usr-timur",
    studentId: "stu-timur",
    passwordEnv: "SEED_PASSWORD_TIMUR",
  },
  vera: {
    login: "student.new",
    userId: "usr-vera",
    studentId: "stu-vera",
    passwordEnv: "SEED_PASSWORD_VERA",
  },
  irina: {
    login: "staff.irina",
    userId: "usr-irina",
    staffId: "stf-irina",
    passwordEnv: "SEED_PASSWORD_IRINA",
  },
} as const;

export const SEED_PASSWORD_ENVS = Object.values(DEMO).map((d) => d.passwordEnv);

const SEED = 20261105;

/** mulberry32 — маленький детерминированный ГПСЧ (не для секретов!). */
function createRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) throw new Error("pick из пустого списка");
      return item;
    },
  };
}

// ── Справочники ──────────────────────────────────────────────────────────

const FACULTIES = [
  { code: "ФМО", name: "Факультет международных отношений" },
  { code: "МП", name: "Факультет международного права" },
  { code: "МЭО", name: "Факультет международных экономических отношений" },
  { code: "МЖ", name: "Факультет международной журналистики" },
  { code: "ФУП", name: "Факультет управления и политики" },
  { code: "ФМБ", name: "Факультет международного бизнеса и делового администрирования" },
  { code: "МИЭП", name: "Международный институт энергетической политики и дипломатии" },
  { code: "ИМТУР", name: "Институт международной торговли и устойчивого развития" },
] as const;

const facultyId = (code: string) => `fac-${FACULTIES.findIndex((f) => f.code === code) + 1}`;

const PROGRAMS = [
  { id: "prg-mo", faculty: "ФМО", name: "Международные отношения" },
  { id: "prg-zr", faculty: "ФМО", name: "Зарубежное регионоведение" },
  { id: "prg-mp", faculty: "МП", name: "Юриспруденция" },
  { id: "prg-ec", faculty: "МЭО", name: "Экономика" },
  { id: "prg-we", faculty: "МЭО", name: "Мировая экономика" },
  { id: "prg-jr", faculty: "МЖ", name: "Журналистика" },
  { id: "prg-pl", faculty: "ФУП", name: "Политология" },
  { id: "prg-mn", faculty: "ФМБ", name: "Менеджмент" },
  { id: "prg-en", faculty: "МИЭП", name: "Экономика энергетики" },
  { id: "prg-td", faculty: "ИМТУР", name: "Торговое дело" },
] as const;

const DISCIPLINES = [
  { id: "dsc-tmo", name: "Теория международных отношений", credits: 5 },
  { id: "dsc-hist", name: "История дипломатии", credits: 4 },
  { id: "dsc-protocol", name: "Дипломатический протокол и этикет", credits: 3 },
  { id: "dsc-rufp", name: "Внешняя политика России", credits: 4 },
  { id: "dsc-intlaw", name: "Международное публичное право", credits: 5 },
  { id: "dsc-philos", name: "Философия", credits: 3 },
  { id: "dsc-worldec", name: "Мировая экономика", credits: 5 },
  { id: "dsc-macro", name: "Макроэкономика", credits: 4 },
  { id: "dsc-ecmetr", name: "Эконометрика", credits: 4 },
  { id: "dsc-finance", name: "Международные финансы", credits: 4 },
  { id: "dsc-stat", name: "Статистика", credits: 3 },
  { id: "dsc-journ", name: "Основы журналистики", credits: 4 },
  { id: "dsc-media", name: "Медиаправо", credits: 3 },
  { id: "dsc-polit", name: "Политология", credits: 4 },
  { id: "dsc-mgmt", name: "Основы менеджмента", credits: 4 },
  { id: "dsc-en", name: "Английский язык", credits: 6 },
  { id: "dsc-fr", name: "Французский язык", credits: 4 },
] as const;
type DisciplineId = (typeof DISCIPLINES)[number]["id"];

// Вымышленные преподаватели: частотные имена и фамилии, собраны вручную, без реальных списков вуза (S9)
const TEACHERS = [
  "Белов Андрей Викторович",
  "Кравцова Елена Сергеевна",
  "Новиков Павел Олегович",
  "Захарова Ирина Дмитриевна",
  "Лебедев Михаил Юрьевич",
  "Фролова Анна Константиновна",
  "Голубев Константин Ефимович",
  "Комарова Ольга Игоревна",
  "Тихонов Сергей Николаевич",
  "Орлова Наталья Петровна",
  "Мельников Артём Владимирович",
  "Ковалёва Дарья Александровна",
  "Пестов Роман Ильич",
  // T14+: у французского свой преподаватель (вёл историк — оценка «глазами жюри», 12.11) и преподаватель
  // кафедры на замену без своих пар — замена не создаёт накладку
  "Соловьёва Марина Львовна",
  "Романов Илья Сергеевич",
] as const;
/** Преподаватель кафедры на замену («Ведёт преподаватель кафедры»): своих пар нет. */
const SUBSTITUTE_TEACHER = 14;
const teacherId = (i: number) => `tch-${String(i + 1).padStart(2, "0")}`;

/** Кто ведёт дисциплину (один преподаватель на дисциплину — для простоты демо). */
const DISCIPLINE_TEACHER: Record<DisciplineId, number> = {
  "dsc-tmo": 0,
  "dsc-hist": 1,
  "dsc-protocol": 2,
  "dsc-rufp": 0,
  "dsc-intlaw": 3,
  "dsc-philos": 4,
  "dsc-worldec": 5,
  "dsc-macro": 6,
  "dsc-ecmetr": 7,
  "dsc-finance": 8,
  "dsc-stat": 6,
  "dsc-journ": 9,
  "dsc-media": 3,
  "dsc-polit": 10,
  "dsc-mgmt": 12,
  "dsc-en": 11,
  "dsc-fr": 13,
};

interface GroupDef {
  id: string;
  name: string;
  course: number;
  program: string;
  disciplines: DisciplineId[];
}

const GROUPS: GroupDef[] = [
  {
    id: "grp-2mo3",
    name: "2МО-3",
    course: 2,
    program: "prg-mo",
    // Как в «Учёбе» Алисы за 3-й семестр (+ языки — в языковых группах). Философия — в 1-м семестре:
    // в расписании её больше нет (оценка «глазами жюри», 12.11: «в расписании есть, в „Учёбе“ нет»)
    disciplines: ["dsc-tmo", "dsc-hist", "dsc-protocol", "dsc-intlaw"],
  },
  {
    id: "grp-2mo1",
    name: "2МО-1",
    course: 2,
    program: "prg-mo",
    disciplines: ["dsc-tmo", "dsc-hist", "dsc-protocol", "dsc-intlaw"],
  },
  {
    id: "grp-1mo2",
    name: "1МО-2",
    course: 1,
    program: "prg-zr",
    disciplines: ["dsc-hist", "dsc-philos", "dsc-polit", "dsc-stat"],
  },
  {
    id: "grp-4meo1",
    name: "4МЭО-1",
    course: 4,
    program: "prg-we",
    disciplines: ["dsc-worldec", "dsc-finance", "dsc-ecmetr", "dsc-rufp"],
  },
  {
    id: "grp-3meo2",
    name: "3МЭО-2",
    course: 3,
    program: "prg-ec",
    disciplines: ["dsc-macro", "dsc-ecmetr", "dsc-stat", "dsc-finance"],
  },
  {
    id: "grp-1mj1",
    name: "1МЖ-1",
    course: 1,
    program: "prg-jr",
    disciplines: ["dsc-journ", "dsc-media", "dsc-philos", "dsc-hist"],
  },
  {
    id: "grp-2mp1",
    name: "2МП-1",
    course: 2,
    program: "prg-mp",
    disciplines: ["dsc-intlaw", "dsc-philos", "dsc-hist", "dsc-polit"],
  },
  {
    id: "grp-3fup1",
    name: "3ФУП-1",
    course: 3,
    program: "prg-pl",
    disciplines: ["dsc-polit", "dsc-rufp", "dsc-stat", "dsc-philos"],
  },
  {
    id: "grp-2fmb2",
    name: "2ФМБ-2",
    course: 2,
    program: "prg-mn",
    disciplines: ["dsc-mgmt", "dsc-macro", "dsc-stat", "dsc-finance"],
  },
  {
    id: "grp-1imtur1",
    name: "1ИМТУР-1",
    course: 1,
    program: "prg-td",
    disciplines: ["dsc-worldec", "dsc-mgmt", "dsc-stat", "dsc-philos"],
  },
];

const LANGUAGE_GROUPS = [
  {
    id: "lg-en-b2-4",
    language: "Английский",
    level: "B2",
    name: "Англ. B2-4",
    discipline: "dsc-en" as const,
    // Вторник и пятница: четверг Алисы — день в Одинцове (T14+)
    days: [2, 5],
    slot: 3,
  },
  {
    id: "lg-fr-a2-1",
    language: "Французский",
    level: "A2",
    name: "Франц. A2-1",
    discipline: "dsc-fr" as const,
    days: [3],
    slot: 4,
  },
  {
    id: "lg-en-c1-2",
    language: "Английский",
    level: "C1",
    name: "Англ. C1-2",
    discipline: "dsc-en" as const,
    days: [1, 3],
    slot: 4,
  },
  {
    id: "lg-en-b1-1",
    language: "Английский",
    level: "B1",
    name: "Англ. B1-1",
    discipline: "dsc-en" as const,
    days: [2, 5],
    slot: 4,
  },
];

const MAIN = "Главный корпус (пр-т Вернадского)";
const ODINTSOVO = "Одинцово";

/** Сетка пар (по Москве). */
const SLOTS = [
  ["09:00", "10:20"],
  ["10:40", "12:00"],
  ["12:40", "14:00"],
  ["14:20", "15:40"],
  ["16:00", "17:20"],
  ["17:40", "19:00"],
] as const;

const REQUEST_TYPES = [
  {
    code: "study_ru",
    title: "Справка об обучении",
    description: "Подтверждает, что вы учитесь в вузе: курс, форма обучения, срок окончания.",
    purposeTags: ["work", "other"],
    languages: ["ru"],
    slaDays: 2,
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
  {
    code: "study_en",
    title: "Справка об обучении на английском",
    description: "Certificate of enrolment — для посольств, стажировок и зарубежных вузов.",
    purposeTags: ["visa", "internship", "work"],
    languages: ["en"],
    slaDays: 3,
    fields: [
      {
        name: "addressee",
        // Подпись по-русски, а не «Addressee (…)» посреди русского интерфейса (оценка «глазами жюри», 12.11)
        label: "Кому адресована",
        hint: "По-английски, например: Embassy of France. Если оставить пустым — «To whom it may concern»",
        type: "text",
        required: false,
        maxLength: 120,
      },
    ],
  },
  {
    code: "military",
    title: "Справка для военкомата",
    description: "Форма для военного комиссариата: отсрочка на время обучения.",
    purposeTags: ["military"],
    languages: ["ru"],
    slaDays: 3,
    fields: [
      {
        name: "commissariat",
        label: "Военный комиссариат (район)",
        type: "text",
        required: true,
        maxLength: 160,
      },
    ],
  },
  {
    code: "social",
    title: "Справка в органы социальной защиты",
    description: "Для оформления льгот и пособий: подтверждение очного обучения.",
    purposeTags: ["social"],
    languages: ["ru"],
    slaDays: 3,
    fields: [
      {
        name: "office",
        label: "Отделение соцзащиты",
        type: "text",
        required: true,
        maxLength: 160,
      },
    ],
  },
  {
    code: "embassy",
    title: "Справка для посольства (визовая)",
    description: "Подтверждение обучения и каникул для визовой анкеты.",
    purposeTags: ["visa"],
    languages: ["ru", "en"],
    slaDays: 5,
    fields: [
      // Подсказки (T13, ревью T07–T08): что и в каком виде ждёт визовая анкета
      {
        name: "country",
        label: "Страна",
        type: "text",
        required: true,
        maxLength: 80,
        hint: "Страна визы, например: Франция",
      },
      {
        name: "tripDates",
        label: "Даты поездки",
        type: "dates",
        required: true,
        hint: "Если даты ещё не точны — укажите примерные",
      },
    ],
  },
  {
    code: "scholarship",
    title: "Справка о размере стипендии",
    description: "Сумма стипендии за выбранный период.",
    purposeTags: ["social", "work"],
    languages: ["ru"],
    slaDays: 2,
    fields: [
      {
        name: "period",
        label: "За какой период",
        type: "select",
        required: true,
        options: ["3 месяца", "6 месяцев", "12 месяцев"],
      },
    ],
  },
  {
    // T14, «Вам положено»: заявление деканат предлагает сам, когда студент проходит правило (вымышленное)
    code: "scholarship_up",
    title: "Заявление на повышенную стипендию",
    description: "Повышенная академическая стипендия за учёбу — по итогам рейтинга.",
    purposeTags: ["other"],
    languages: ["ru"],
    slaDays: 5,
    fields: [
      {
        name: "comment",
        label: "Комментарий для деканата (необязательно)",
        type: "text",
        required: false,
        maxLength: 300,
      },
    ],
  },
  {
    code: "academic",
    title: "Академическая справка",
    description: "Перечень освоенных дисциплин с оценками — для перевода или продолжения обучения.",
    purposeTags: ["other"],
    languages: ["ru", "en"],
    slaDays: 10,
    fields: [
      { name: "reason", label: "Для чего нужна", type: "text", required: true, maxLength: 200 },
    ],
  },
  {
    code: "internship_app",
    title: "Заявление на стажировку / академическую мобильность",
    description: "Согласование выезда на стажировку или семестр в вузе-партнёре.",
    purposeTags: ["internship"],
    languages: ["ru"],
    slaDays: 7,
    fields: [
      {
        name: "host",
        label: "Принимающая организация или вуз",
        type: "text",
        required: true,
        maxLength: 160,
      },
      { name: "period", label: "Период", type: "text", required: true, maxLength: 80 },
    ],
  },
  {
    // T13: из долга в «Учёбе» — «Подать заявление на пересдачу» с подставленной дисциплиной
    code: "retake",
    title: "Заявление на пересдачу",
    description:
      "Пересдача экзамена или зачёта по дисциплине с долгом. Дату и комиссию назначает деканат.",
    purposeTags: ["other"],
    languages: ["ru"],
    slaDays: 3,
    fields: [
      {
        name: "discipline",
        label: "Дисциплина",
        type: "text",
        required: true,
        maxLength: 160,
        hint: "Название как в разделе «Учёба»",
      },
      {
        name: "comment",
        label: "Комментарий для деканата",
        type: "text",
        required: false,
        maxLength: 300,
        hint: "Например: в какие дни вам удобно пересдавать",
      },
    ],
  },
] as const;
const requestTypeId = (code: string) => `rqt-${code}`;

/**
 * Пересдача долга Тимура («Эконометрика», 6-й семестр) — через 3 дня, но не в воскресенье.
 * Раньше «через 3 дня» стоял экзамен текущего семестра — выпадал на воскресенье и шёл до лекций по тому же
 * предмету (оценка «глазами жюри», T14). Пересдача в течение семестра — так и бывает.
 */
export function timurRetakeDay(today: Date): Date {
  const day = addDays(today, 3);
  return mskWeekday(day) === 7 ? addDays(day, 1) : day;
}

/** Дней до пятницы, не меньше двух: срок стипендиальной комиссии («документы до пятницы»). */
export function daysToFriday(today: Date): number {
  let n = 2;
  while (mskWeekday(addDays(today, n)) !== 5) n += 1;
  return n;
}

// ── Построение ───────────────────────────────────────────────────────────

export function buildSeed(now: Date): SeedData {
  const rng = createRng(SEED);
  const today = mskStartOfDay(now);
  const todayWeekday = mskWeekday(today);
  const weekStart = mskStartOfWeek(today);
  const at = (dayOffset: number, time: string) => mskAt(addDays(today, dayOffset), time);

  const faculties = FACULTIES.map((f, i) => ({ id: `fac-${i + 1}`, code: f.code, name: f.name }));
  const programs = PROGRAMS.map((p) => ({
    id: p.id,
    name: p.name,
    facultyId: facultyId(p.faculty),
  }));
  const groups = GROUPS.map((g) => ({
    id: g.id,
    name: g.name,
    course: g.course,
    programId: g.program,
  }));
  const languageGroups = LANGUAGE_GROUPS.map(({ id, language, level, name }) => ({
    id,
    language,
    level,
    name,
  }));
  const teachers = TEACHERS.map((fullName, i) => ({ id: teacherId(i), fullName }));
  const disciplines = DISCIPLINES.map((d) => ({ ...d }));

  // ── Люди ──
  const users: SeedUser[] = [
    {
      id: DEMO.alisa.userId,
      login: DEMO.alisa.login,
      role: "STUDENT",
      passwordEnv: DEMO.alisa.passwordEnv,
    },
    {
      id: DEMO.timur.userId,
      login: DEMO.timur.login,
      role: "STUDENT",
      passwordEnv: DEMO.timur.passwordEnv,
    },
    {
      id: DEMO.vera.userId,
      login: DEMO.vera.login,
      role: "STUDENT",
      passwordEnv: DEMO.vera.passwordEnv,
    },
    {
      id: DEMO.irina.userId,
      login: DEMO.irina.login,
      role: "STAFF",
      passwordEnv: DEMO.irina.passwordEnv,
    },
  ];
  const students: SeedStudent[] = [
    {
      id: DEMO.alisa.studentId,
      userId: DEMO.alisa.userId,
      lastName: "Петрова",
      firstName: "Алиса",
      middleName: "Сергеевна",
      recordBookNo: "24-МО-0457",
      groupId: "grp-2mo3",
    },
    {
      id: DEMO.timur.studentId,
      userId: DEMO.timur.userId,
      lastName: "Галиев",
      firstName: "Тимур",
      middleName: "Рустамович",
      recordBookNo: "22-МЭО-0183",
      groupId: "grp-4meo1",
    },
    {
      id: DEMO.vera.studentId,
      userId: DEMO.vera.userId,
      lastName: "Соколова",
      firstName: "Вера",
      middleName: "Андреевна",
      recordBookNo: "25-МЖ-0912",
      groupId: "grp-1mj1",
    },
  ];
  // Фоновые студенты — чтобы очередь сотрудника выглядела живой. Войти под ними нельзя (passwordEnv: null).
  const background = [
    {
      key: "savelev",
      last: "Савельев",
      first: "Игорь",
      middle: "Андреевич",
      group: "grp-2mo1",
      rb: "24-МО-0311",
    },
    {
      key: "koroleva",
      last: "Королёва",
      first: "Полина",
      middle: "Сергеевна",
      group: "grp-3meo2",
      rb: "23-МЭО-0544",
    },
    {
      key: "demidov",
      last: "Демидов",
      first: "Кирилл",
      middle: "Олегович",
      group: "grp-1mj1",
      rb: "25-МЖ-0877",
    },
    {
      key: "ershova",
      last: "Ершова",
      first: "Ульяна",
      middle: "Викторовна",
      group: "grp-1mo2",
      rb: "25-МО-0129",
    },
    {
      key: "borisov",
      last: "Борисов",
      first: "Глеб",
      middle: "Романович",
      group: "grp-2mp1",
      rb: "24-МП-0402",
    },
    // T14+: ещё трое на ФМО и МЭО — у Ирины в очереди есть что выдать пачкой
    {
      key: "zaitsev",
      last: "Зайцев",
      first: "Артём",
      middle: "Ильич",
      group: "grp-4meo1",
      rb: "22-МЭО-0718",
    },
    {
      key: "nikitina",
      last: "Никитина",
      first: "Дарья",
      middle: "Павловна",
      group: "grp-2mo1",
      rb: "24-МО-0356",
    },
    // T14+: однофамилец Савельева Игоря Андреевича в той же группе 2МО-1 — «Савельев И. А.» дважды:
    // у Ирины в очереди их различает хвост зачётки
    {
      key: "savelev2",
      last: "Савельев",
      first: "Илья",
      middle: "Андреевич",
      group: "grp-2mo1",
      rb: "24-МО-0388",
    },
    {
      key: "fomin",
      last: "Фомин",
      first: "Матвей",
      middle: "Денисович",
      group: "grp-1mo2",
      rb: "25-МО-0164",
    },
  ];
  for (const b of background) {
    users.push({
      id: `usr-${b.key}`,
      login: `student.${b.key}`,
      role: "STUDENT",
      passwordEnv: null,
    });
    students.push({
      id: `stu-${b.key}`,
      userId: `usr-${b.key}`,
      lastName: b.last,
      firstName: b.first,
      middleName: b.middle,
      recordBookNo: b.rb,
      groupId: b.group,
    });
  }
  const studentLanguageGroups = [
    { studentId: DEMO.alisa.studentId, languageGroupId: "lg-en-b2-4" },
    { studentId: DEMO.alisa.studentId, languageGroupId: "lg-fr-a2-1" },
    { studentId: DEMO.timur.studentId, languageGroupId: "lg-en-c1-2" },
    { studentId: DEMO.vera.studentId, languageGroupId: "lg-en-b1-1" },
  ];
  const staff = [
    {
      id: DEMO.irina.staffId,
      userId: DEMO.irina.userId,
      fullName: "Морозова Ирина Сергеевна",
      facultyIds: [facultyId("ФМО"), facultyId("МЭО")],
    },
  ];

  // ── Расписание ──
  const lessons = buildLessons({ rng, today, todayWeekday, weekStart });

  // ── Оценки ──
  const grades = buildGrades({ today });

  // ── Заявки ──
  const requestTypes = REQUEST_TYPES.map((t) => ({
    id: requestTypeId(t.code),
    code: t.code,
    title: t.title,
    description: t.description,
    purposeTags: [...t.purposeTags],
    languages: [...t.languages],
    slaDays: t.slaDays,
    fields: t.fields.map((f) => ({ ...f })) as Prisma.InputJsonValue,
  }));
  const { requests, requestEvents, issuedDocuments } = buildRequests({ now, today, at });

  // T14+: база знаний — одна уже опубликованная запись ФМО «из прошлого» (без заявки-источника).
  // Черновик из заявки Ирина делает в демо сама — из выданной справки Савельева (savelev-visa)
  const faqEntries: Prisma.FaqEntryCreateManyInput[] = [
    {
      id: "faq-typo",
      facultyId: facultyId("ФМО"),
      title: "Что делать, если в справке ошибка — например, в фамилии?",
      keywords: "ошибка в справке, опечатка, неверная фамилия, исправить справку, перепутали",
      body:
        "Закажите ту же справку заново и в поле «Куда предоставляется» допишите: «исправление: …» — " +
        "что не так. Справку с ошибкой деканат отзовёт: QR-код в ней покажет «Отозвана». " +
        "Исправленную делаем за 1 рабочий день.",
      published: true,
      publishedAt: at(-6, "15:10"),
      createdByUserId: DEMO.irina.userId,
      createdAt: at(-6, "14:50"),
      updatedAt: at(-6, "15:10"),
    },
  ];

  // ── Объявления, дедлайны, уведомления ──
  const audience = (a: Audience) => a as Prisma.InputJsonValue;
  const announcements = [
    {
      id: "ann-1",
      title: "Зимняя сессия: расписание экзаменов",
      body: "Расписание экзаменов и зачётов опубликовано в разделе «Учёба». Проверьте даты и время.",
      audience: audience({}),
      authorId: DEMO.irina.staffId,
      publishedAt: at(-1, "10:00"),
      pinned: true,
    },
    {
      id: "ann-2",
      title: "Стипендиальная комиссия — документы до пятницы",
      body: "Заявления на повышенную стипендию принимаются через «Заявки». Справки о доходах — не нужны.",
      audience: audience({ facultyCodes: ["ФМО", "МЭО"] }),
      authorId: DEMO.irina.staffId,
      publishedAt: at(-3, "12:30"),
      pinned: true,
    },
    {
      id: "ann-3",
      title: "Неделя карьеры МЭО",
      // Ссылки в объявлении нет — и обещания ссылки нет (оценка «глазами жюри», 12.11)
      body: "Встречи с работодателями в актовом зале. Записаться можно в деканате МЭО до пятницы.",
      audience: audience({ facultyCodes: ["МЭО"] }),
      authorId: DEMO.irina.staffId,
      publishedAt: at(-2, "09:15"),
      pinned: false,
    },
    {
      id: "ann-4",
      title: "Конференция «Протокол и дипломатия»",
      body: "Студенческая конференция ФМО. Приём тезисов — до конца месяца.",
      audience: audience({ facultyCodes: ["ФМО"] }),
      authorId: DEMO.irina.staffId,
      publishedAt: at(-5, "15:00"),
      pinned: false,
    },
    {
      id: "ann-5",
      title: "Медосмотр для первого курса",
      body: "Пройти медосмотр нужно до конца месяца, кабинет 112, по будням с 10 до 16.",
      audience: audience({ courses: [1] }),
      authorId: DEMO.irina.staffId,
      publishedAt: at(-6, "11:00"),
      pinned: false,
    },
    {
      id: "ann-6",
      title: "Изменение расписания группы 2МО-3",
      body: "Сегодняшняя пара перенесена — подробности в расписании.",
      audience: audience({ groupNames: ["2МО-3"] }),
      authorId: DEMO.irina.staffId,
      publishedAt: at(0, "07:30"),
      pinned: false,
    },
    {
      // T14: «Вы сказали — мы сделали» — ответ на отзыв о часах приёма (оценка заявки koroleva-old)
      id: "ann-7",
      title: "Вы просили — выдаём справки по четвергам до 19:00",
      body: "Студенты, которые работают или на стажировке, писали в отзывах, что не успевают забрать справку до 17:00. С этой недели по четвергам деканат выдаёт готовые справки до 19:00, кабинет 2104.",
      audience: audience({ facultyCodes: ["ФМО", "МЭО"] }),
      authorId: DEMO.irina.staffId,
      publishedAt: at(-4, "16:00"),
      pinned: false,
      youSaid: true,
    },
  ];
  const deadlines = [
    {
      id: "ddl-1",
      title: "Эссе по теории международных отношений",
      dueAt: at(2, "23:59"),
      audience: audience({ groupNames: ["2МО-3", "2МО-1"] }),
      link: null,
    },
    {
      id: "ddl-2",
      title: "Заявление на повышенную стипендию",
      // В пятницу — как в объявлении «документы до пятницы» (раньше «+5 дней» расходилось с заголовком)
      dueAt: at(daysToFriday(today), "18:00"),
      audience: audience({ facultyCodes: ["ФМО", "МЭО"] }),
      // Тип заявления в ссылке: «Скоро» показывает дедлайн только тем, кто под правило подходит
      // (offer-rules → deadlineRelevant), — не Тимуру с долгом
      link: "/requests/new?type=scholarship_up",
    },
    {
      id: "ddl-3",
      title: "Выбор дисциплин по выбору на весенний семестр",
      dueAt: at(9, "18:00"),
      audience: audience({}),
      link: null,
    },
    {
      id: "ddl-4",
      title: "Тема курсовой работы — согласовать с руководителем",
      dueAt: at(12, "18:00"),
      audience: audience({ facultyCodes: ["МЭО"], courses: [4] }),
      link: null,
    },
  ];
  // Текст уведомления о переносе — из настоящей перенесённой пары: «первая пара» была неправдой по четвергам,
  // когда переносится третья (оценка «глазами жюри», T14)
  const moved = lessons.find(
    (l) =>
      l.groupId === ALISA_GROUP &&
      l.change === "MOVED" &&
      l.originalStartsAt &&
      mskDateKey(new Date(l.startsAt)) === mskDateKey(today),
  );
  const hhmm = (d: Date | string) =>
    new Date(d).toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Moscow",
    });
  const movedText = moved
    ? `Пара ${hhmm(moved.originalStartsAt!)} перенесена на ${hhmm(moved.startsAt)}.`
    : "Пара перенесена.";
  const notifications = buildNotifications({ at, movedText });

  // Ничего «из будущего»: сид может запуститься ночью (cron в 04:00), а объявления датированы утром
  const notLater = (d: Date | string) => (new Date(d) > now ? now : new Date(d));
  for (const a of announcements) a.publishedAt = notLater(a.publishedAt);
  for (const n of notifications) n.createdAt = notLater(n.createdAt!);
  for (const n of notifications) if (n.readAt) n.readAt = notLater(n.readAt);

  return {
    faculties,
    programs,
    groups,
    languageGroups,
    users,
    students,
    studentLanguageGroups,
    staff,
    teachers,
    disciplines,
    lessons,
    grades,
    requestTypes,
    requests,
    requestEvents,
    issuedDocuments,
    announcements,
    deadlines,
    notifications,
    faqEntries: faqEntries.map((f) => ({
      ...f,
      createdAt: notLater(f.createdAt!),
      updatedAt: notLater(f.updatedAt!),
      publishedAt: f.publishedAt ? notLater(f.publishedAt) : null,
    })),
  };
}

// ── Расписание ───────────────────────────────────────────────────────────

const ALISA_GROUP = "grp-2mo3";

function buildLessons({
  rng,
  today,
  todayWeekday,
  weekStart,
}: {
  rng: ReturnType<typeof createRng>;
  today: Date;
  todayWeekday: number;
  weekStart: Date;
}): Prisma.LessonCreateManyInput[] {
  const lessons: Prisma.LessonCreateManyInput[] = [];

  // Недельный шаблон: одинаковый каждую неделю, как настоящее расписание.
  // Правдоподобие (оценка «глазами жюри», 12.11): у преподавателя и аудитории нет двух пар в одно время;
  // дисциплина — 2–3 раза в неделю и не больше двух пар в день; у каждой пары группы — постоянная аудитория.
  type Slot = {
    weekday: number;
    slot: number;
    discipline: DisciplineId;
    kind: "LECTURE" | "SEMINAR";
    building: string;
    room: string;
  };
  const busyTeacher = new Set<string>();
  const usedRooms = new Set<string>(["1001", "4012"]); // аудитория пересдачи Тимура и «смена аудитории»
  const book = (discipline: DisciplineId, weekday: number, slot: number) =>
    busyTeacher.add(`${DISCIPLINE_TEACHER[discipline]}@${weekday}-${slot}`);
  const teacherFree = (discipline: DisciplineId, weekday: number, slot: number) =>
    !busyTeacher.has(`${DISCIPLINE_TEACHER[discipline]}@${weekday}-${slot}`);

  // Языковые группы — слоты 3–4 (у групп пар в это время нет, кроме четверга Алисы — языков в четверг нет)
  for (const lg of LANGUAGE_GROUPS) for (const d of lg.days) book(lg.discipline, d, lg.slot);

  // 2МО-3 (Алиса) — вручную: каждая дисциплина 2–3 раза в неделю, у лекций поточная 3045, у семинаров —
  // своя аудитория. Четверг — утром две пары в Одинцове, после перерыва больше двух часов — главный корпус
  // (переход между корпусами, T06; дорога около часа — T14). Суббота свободна.
  const L = "LECTURE" as const;
  const S = "SEMINAR" as const;
  const alisaWeek: Slot[] = [
    { weekday: 1, slot: 0, discipline: "dsc-tmo", kind: L, building: MAIN, room: "3045" },
    { weekday: 1, slot: 1, discipline: "dsc-intlaw", kind: S, building: MAIN, room: "2204" },
    { weekday: 2, slot: 0, discipline: "dsc-hist", kind: L, building: MAIN, room: "3045" },
    { weekday: 2, slot: 1, discipline: "dsc-tmo", kind: S, building: MAIN, room: "2112" },
    { weekday: 3, slot: 0, discipline: "dsc-intlaw", kind: L, building: MAIN, room: "3045" },
    { weekday: 3, slot: 1, discipline: "dsc-hist", kind: S, building: MAIN, room: "2106" },
    { weekday: 4, slot: 0, discipline: "dsc-protocol", kind: L, building: ODINTSOVO, room: "4044" },
    { weekday: 4, slot: 1, discipline: "dsc-protocol", kind: S, building: ODINTSOVO, room: "4046" },
    { weekday: 4, slot: 3, discipline: "dsc-hist", kind: S, building: MAIN, room: "2106" },
    { weekday: 4, slot: 4, discipline: "dsc-tmo", kind: S, building: MAIN, room: "2112" },
    { weekday: 5, slot: 0, discipline: "dsc-intlaw", kind: S, building: MAIN, room: "2204" },
  ];
  for (const s of alisaWeek) {
    book(s.discipline, s.weekday, s.slot);
    usedRooms.add(s.room);
  }

  // Остальные группы: лекция и семинар по каждой дисциплине (+ второй семинар от 4 кредитов), пн–пт,
  // слоты 0–2. Порядок случайный, но пара ставится, только если преподаватель свободен и дисциплины
  // в этот день ещё меньше двух; аудитория — своя у каждой пары «группа × дисциплина × вид»
  const credits = (d: DisciplineId) => DISCIPLINES.find((x) => x.id === d)!.credits;
  const roomOf = new Map<string, string>();
  const roomFor = (key: string) => {
    const known = roomOf.get(key);
    if (known) return known;
    let r: string;
    do r = String(rng.int(1, 5) * 1000 + rng.int(10, 60));
    while (usedRooms.has(r));
    roomOf.set(key, r);
    usedRooms.add(r);
    return r;
  };
  const templates = new Map<string, Slot[]>([[ALISA_GROUP, alisaWeek]]);
  for (const g of GROUPS) {
    if (g.id === ALISA_GROUP) continue;
    const items = g.disciplines.flatMap((d) => [
      { d, kind: L },
      { d, kind: S },
      ...(credits(d) >= 4 ? [{ d, kind: S }] : []),
    ]);
    // Перемешать детерминированно (Фишер — Йейтс на rng сида)
    for (let i = items.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
    const slots: Slot[] = [];
    for (let slot = 0; slot <= 2; slot++) {
      for (let weekday = 1; weekday <= 5; weekday++) {
        const sameDay = (d: DisciplineId) =>
          slots.filter((s) => s.weekday === weekday && s.discipline === d).length;
        const k = items.findIndex((it) => teacherFree(it.d, weekday, slot) && sameDay(it.d) < 2);
        if (k < 0) continue;
        const [it] = items.splice(k, 1);
        book(it!.d, weekday, slot);
        slots.push({
          weekday,
          slot,
          discipline: it!.d,
          kind: it!.kind,
          building: MAIN,
          room: roomFor(`${g.id}-${it!.d}-${it!.kind}`),
        });
      }
    }
    templates.set(g.id, slots);
  }

  const push = (l: Omit<Prisma.LessonCreateManyInput, "id"> & { idKey: string }) => {
    const { idKey, ...rest } = l;
    lessons.push({ id: `les-${idKey}`, ...rest });
  };

  // Текущая неделя ± 2 недели
  for (let week = -2; week <= 2; week++) {
    for (let weekday = 1; weekday <= 7; weekday++) {
      const day = addDays(weekStart, week * 7 + weekday - 1);
      const dayKey = mskDateKey(day);
      const isToday = dayKey === mskDateKey(today);
      for (const g of GROUPS) {
        let daySlots = (templates.get(g.id) ?? []).filter((s) => s.weekday === weekday);
        // «Сегодня» у Алисы всегда учебный день — даже в воскресенье (иначе демо в выходной пустое)
        // (суббота и воскресенье: в шаблоне пар нет). Аудитории — те же, что у этих пар в будни
        if (isToday && g.id === ALISA_GROUP && daySlots.length === 0) {
          daySlots = [
            {
              weekday,
              slot: 0,
              discipline: "dsc-tmo",
              kind: "LECTURE",
              building: MAIN,
              room: "3045",
            },
            {
              weekday,
              slot: 1,
              discipline: "dsc-hist",
              kind: "SEMINAR",
              building: MAIN,
              room: "2106",
            },
            {
              weekday,
              slot: 2,
              discipline: "dsc-intlaw",
              kind: "SEMINAR",
              building: MAIN,
              room: "2204",
            },
          ];
        }
        for (const s of daySlots) {
          const [start, end] = SLOTS[s.slot]!;
          push({
            idKey: `${g.id}-${dayKey}-${s.slot}`,
            disciplineId: s.discipline,
            teacherId: teacherId(DISCIPLINE_TEACHER[s.discipline]),
            kind: s.kind,
            startsAt: mskAt(day, start),
            endsAt: mskAt(day, end),
            building: s.building,
            room: s.room,
            groupId: g.id,
          });
        }
      }
      for (const lg of LANGUAGE_GROUPS) {
        if (!lg.days.includes(weekday)) continue;
        const [start, end] = SLOTS[lg.slot]!;
        push({
          idKey: `${lg.id}-${dayKey}`,
          disciplineId: lg.discipline,
          teacherId: teacherId(DISCIPLINE_TEACHER[lg.discipline]),
          kind: "LANGUAGE",
          startsAt: mskAt(day, start),
          endsAt: mskAt(day, end),
          building: MAIN,
          room: `Л-${lg.slot + 1}0${lg.days[0]}`,
          languageGroupId: lg.id,
        });
      }
    }
  }

  // Пересдача долга у Тимура через 3 дня, не в воскресенье (06-seed-data)
  const examDay = timurRetakeDay(today);
  push({
    idKey: `grp-4meo1-exam-${mskDateKey(examDay)}`,
    disciplineId: "dsc-ecmetr",
    teacherId: teacherId(DISCIPLINE_TEACHER["dsc-ecmetr"]),
    kind: "EXAM",
    startsAt: mskAt(examDay, "10:00"),
    endsAt: mskAt(examDay, "13:00"),
    building: MAIN,
    room: "1001",
    groupId: "grp-4meo1",
  });

  // В день экзамена у 4МЭО-1 обычных пар нет: экзамен 10:00–13:00 иначе накладывался на пары
  // 09:00 и 10:40 (ux-reviewer, T06)
  // Преподаватель принимает пересдачу — его пары у других групп в это время тоже снимаем (иначе накладка,
  // оценка «глазами жюри», 12.11)
  const examKey = mskDateKey(examDay);
  const exam = lessons.at(-1)!;
  const overlapsExam = (l: Prisma.LessonCreateManyInput) =>
    +new Date(l.startsAt) < +new Date(exam.endsAt) &&
    +new Date(l.endsAt) > +new Date(exam.startsAt);
  for (let i = lessons.length - 1; i >= 0; i--) {
    const l = lessons[i]!;
    if (l.kind === "EXAM") continue;
    const timurDay = l.groupId === "grp-4meo1" && mskDateKey(new Date(l.startsAt)) === examKey;
    if (timurDay || (l.teacherId === exam.teacherId && overlapsExam(l))) lessons.splice(i, 1);
  }

  applyChanges({ lessons, today, todayWeekday, weekStart });
  return lessons;
}

/** Переносы и отмены (06: у Алисы сегодня 1 перенос, за неделю 2 переноса и 1 отмена). */
function applyChanges({
  lessons,
  today,
  todayWeekday,
  weekStart,
}: {
  lessons: Prisma.LessonCreateManyInput[];
  today: Date;
  todayWeekday: number;
  weekStart: Date;
}) {
  const onDay = (groupId: string, day: Date) =>
    lessons
      .filter((l) => l.groupId === groupId && mskDateKey(new Date(l.startsAt)) === mskDateKey(day))
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  // changeNote — только причина или подробность: «Перенос», «было 09:30» интерфейс пишет сам (T05)
  const moveLater = (lesson: Prisma.LessonCreateManyInput, note: string) => {
    // Переносим на свободный слот после последней пары группы в этот день (не пересекается с языками: слот 5)
    const day = mskStartOfDay(new Date(lesson.startsAt));
    const [start, end] = SLOTS[5];
    lesson.originalStartsAt = lesson.startsAt;
    lesson.startsAt = mskAt(day, start);
    lesson.endsAt = mskAt(day, end);
    lesson.change = "MOVED";
    lesson.changeNote = note;
  };

  // 1) Сегодня у Алисы: одна пара переносится на вечер — первая, но не та, что образует переход в Одинцово
  // (по четвергам: пара в главном корпусе → пара в Одинцове). Раньше всегда брали первую: в четверг переход
  // пропадал и в демо, и в тестах (найдено 12.11 — тесты расписания упали после полуночи среды)
  // С T14+ в четверг: две пары в Одинцове, затем главный корпус — переход (последняя пара в Одинцове и
  // следующая) не трогаем; переносим пару в главном корпусе, чтобы вечером не ехать обратно в Одинцово
  const todays = onDay(ALISA_GROUP, today);
  const odLast = todays.findLastIndex((l) => l.building === ODINTSOVO);
  const candidates = todays.filter((_, i) => odLast < 0 || (i !== odLast && i !== odLast + 1));
  const first = candidates.find((l) => l.building === MAIN) ?? candidates[0] ?? todays[0];
  if (!first) throw new Error("У 2МО-3 нет пар сегодня — нарушено правило «сегодня учебный день»");
  moveLater(first, "Преподаватель на конференции");

  // 2) Ещё один перенос и одна отмена у Алисы на этой неделе — в другие дни (пн–пт, не сегодня и не
  // четверг с переходом), и все три изменения — у разных дисциплин (оценка «глазами жюри», 12.11:
  // «перенос, отмена, перенос подряд у ТМО»)
  const used = new Set([first.disciplineId]);
  const otherDays = [1, 2, 3, 5]
    .filter((d) => d !== todayWeekday)
    .map((d) => addDays(weekStart, d - 1));
  const pickOn = (days: Date[], last: boolean) => {
    for (const day of days) {
      const list = onDay(ALISA_GROUP, day).filter((l) => !used.has(l.disciplineId));
      const l = last ? list.at(-1) : list[0];
      if (l) return { l, day };
    }
    return null;
  };
  const moved = pickOn(otherDays, false);
  if (moved) {
    moveLater(moved.l, "По просьбе кафедры");
    used.add(moved.l.disciplineId);
  }
  const cancelled = pickOn(
    otherDays.filter((d) => d !== moved?.day),
    true,
  );
  if (cancelled) {
    cancelled.l.change = "CANCELLED";
    cancelled.l.changeNote = "Занятие отработаем на консультации";
  }

  // 3) У других групп — смена аудитории и преподавателя (для разнообразия в T06)
  // Ближайший следующий день с парами: в пятницу «завтра» и «послезавтра» у 4МЭО-1 может не быть пар,
  // и смена аудитории тихо пропадала (найдено в T06)
  const timurToday = [1, 2, 3, 4, 5, 6, 7]
    .map((d) => onDay("grp-4meo1", addDays(today, d)).find((l) => l.kind !== "EXAM"))
    .find((l) => l !== undefined);
  if (timurToday) {
    timurToday.change = "ROOM_CHANGED";
    timurToday.changeNote = `Была ${timurToday.room}`;
    timurToday.room = "4012";
  }
  const nextWeek = onDay("grp-3meo2", addDays(weekStart, 8))[0];
  if (nextWeek) {
    nextWeek.change = "TEACHER_CHANGED";
    nextWeek.changeNote = "Ведёт преподаватель кафедры";
    nextWeek.teacherId = teacherId(SUBSTITUTE_TEACHER);
  }
}

// ── Оценки ───────────────────────────────────────────────────────────────

function buildGrades({ today }: { today: Date }): Prisma.GradeCreateManyInput[] {
  const grades: Prisma.GradeCreateManyInput[] = [];
  const add = (
    studentId: string,
    disciplineId: DisciplineId,
    semester: number,
    g: Partial<Prisma.GradeCreateManyInput> & Pick<Prisma.GradeCreateManyInput, "kind">,
  ) =>
    grades.push({
      id: `grd-${studentId}-${disciplineId}-${semester}`,
      studentId,
      disciplineId,
      teacherId: teacherId(DISCIPLINE_TEACHER[disciplineId]),
      semester,
      ...g,
    });

  // Сессия текущего семестра — в январе следующего года (вымышленные правила: docs/01-concept.md)
  // Учебный год начинается в сентябре: с сентября по декабрь сессия — в январе следующего года
  const mskMonth = Number(mskDateKey(today).slice(5, 7));
  const sessionYear = mskYear(today) + (mskMonth >= 9 ? 1 : 0);
  const sessionDay = (day: number) => new Date(Date.UTC(sessionYear, 0, day, 7, 0));

  // Алиса, 2 курс: семестры 1–2 закрыты на «отлично», текущий 3-й — рейтинг в процессе. Стипендия сохраняется.
  const a = DEMO.alisa.studentId;
  add(a, "dsc-hist", 1, {
    kind: "EXAM",
    finalMark: 5,
    ratingPoints: 91,
    examDate: new Date(Date.UTC(sessionYear - 1, 0, 15, 7)),
  });
  add(a, "dsc-philos", 1, { kind: "CREDIT", passed: true, ratingPoints: 84 });
  add(a, "dsc-en", 1, { kind: "GRADED_CREDIT", finalMark: 5, ratingPoints: 93 });
  // Две сессии подряд только «отлично» — под правило «Деканат предлагает» повышенную стипендию (T14)
  add(a, "dsc-tmo", 2, {
    kind: "EXAM",
    finalMark: 5,
    ratingPoints: 90,
    examDate: new Date(Date.UTC(sessionYear - 1, 5, 18, 7)),
  });
  add(a, "dsc-intlaw", 2, {
    kind: "EXAM",
    finalMark: 5,
    ratingPoints: 88,
    examDate: new Date(Date.UTC(sessionYear - 1, 5, 24, 7)),
  });
  add(a, "dsc-fr", 2, { kind: "CREDIT", passed: true, ratingPoints: 81 });
  add(a, "dsc-tmo", 3, { kind: "EXAM", ratingPoints: 82, examDate: sessionDay(13) });
  add(a, "dsc-hist", 3, { kind: "EXAM", ratingPoints: 76, examDate: sessionDay(17) });
  add(a, "dsc-protocol", 3, { kind: "CREDIT", ratingPoints: 90 });
  add(a, "dsc-intlaw", 3, { kind: "GRADED_CREDIT", ratingPoints: 73 });
  add(a, "dsc-en", 3, { kind: "GRADED_CREDIT", ratingPoints: 94 });
  add(a, "dsc-fr", 3, { kind: "CREDIT", ratingPoints: 79 });

  // Тимур, 4 курс: долг по эконометрике (6-й семестр), пересдача через 3 дня (не в воскресенье) — дата
  // пересдачи стоит у оценки с долгом; «Международные финансы» 54/100. Стипендии нет из-за долга.
  const t = DEMO.timur.studentId;
  // Семестры 1–5 закрыты без долгов, на «хорошо» и «отлично» — график рейтинга по семестрам у 4-го курса
  // не из двух столбцов (оценка «глазами жюри», 12.11). Стипендию снимает только долг 6-го семестра
  const past = (semester: number, month: number, day: number) =>
    new Date(Date.UTC(sessionYear - 4 + Math.ceil(semester / 2), month, day, 7));
  add(t, "dsc-hist", 1, { kind: "EXAM", finalMark: 4, ratingPoints: 74, examDate: past(1, 0, 16) });
  add(t, "dsc-philos", 1, { kind: "CREDIT", passed: true, ratingPoints: 70 });
  add(t, "dsc-en", 1, { kind: "GRADED_CREDIT", finalMark: 5, ratingPoints: 88 });
  add(t, "dsc-macro", 2, {
    kind: "EXAM",
    finalMark: 4,
    ratingPoints: 72,
    examDate: past(2, 5, 19),
  });
  add(t, "dsc-stat", 2, { kind: "GRADED_CREDIT", finalMark: 5, ratingPoints: 85 });
  add(t, "dsc-mgmt", 3, { kind: "EXAM", finalMark: 4, ratingPoints: 76, examDate: past(3, 0, 18) });
  add(t, "dsc-en", 3, { kind: "GRADED_CREDIT", finalMark: 5, ratingPoints: 90 });
  add(t, "dsc-finance", 4, {
    kind: "EXAM",
    finalMark: 4,
    ratingPoints: 69,
    examDate: past(4, 5, 20),
  });
  add(t, "dsc-polit", 4, { kind: "CREDIT", passed: true, ratingPoints: 75 });
  add(t, "dsc-worldec", 5, {
    kind: "EXAM",
    finalMark: 4,
    ratingPoints: 73,
    examDate: past(5, 0, 17),
  });
  add(t, "dsc-stat", 5, { kind: "GRADED_CREDIT", finalMark: 4, ratingPoints: 70 });
  add(t, "dsc-worldec", 6, {
    kind: "EXAM",
    finalMark: 4,
    ratingPoints: 71,
    examDate: new Date(Date.UTC(sessionYear - 1, 5, 16, 7)),
  });
  add(t, "dsc-ecmetr", 6, {
    kind: "EXAM",
    finalMark: 2,
    ratingPoints: 38,
    examDate: mskAt(timurRetakeDay(today), "10:00"),
  });
  add(t, "dsc-rufp", 6, { kind: "CREDIT", passed: true, ratingPoints: 66 });
  add(t, "dsc-worldec", 7, { kind: "EXAM", ratingPoints: 61, examDate: sessionDay(13) });
  add(t, "dsc-finance", 7, { kind: "EXAM", ratingPoints: 54, examDate: sessionDay(20) });
  add(t, "dsc-ecmetr", 7, { kind: "GRADED_CREDIT", ratingPoints: 68 });
  add(t, "dsc-en", 7, { kind: "GRADED_CREDIT", ratingPoints: 80 });
  // Внешняя политика России — в расписании 4МЭО-1 есть, в «Учёбе» не было (оценка «глазами жюри», 12.11)
  add(t, "dsc-rufp", 7, { kind: "CREDIT", ratingPoints: 72 });

  // Вера, 1 курс: оценок нет — для пустых состояний.
  return grades;
}

// ── Заявки ───────────────────────────────────────────────────────────────

function buildRequests({
  now,
  today,
  at,
}: {
  now: Date;
  today: Date;
  at: (d: number, t: string) => Date;
}) {
  const requests: Prisma.RequestCreateManyInput[] = [];
  const requestEvents: Prisma.RequestEventCreateManyInput[] = [];
  const issuedDocuments: SeedIssuedDocument[] = [];
  const irina = DEMO.irina.userId;

  type Step = {
    status: Prisma.RequestCreateManyInput["status"] & string;
    dayOffset: number;
    time: string;
    comment?: string;
  };
  const add = (r: {
    key: string;
    studentKey: string;
    type: string;
    language: string;
    payload: Record<string, string>;
    steps: Step[];
    /** T14: оценка студента после «Выдана» — для сводки «Что говорят студенты» у сотрудника */
    rating?: { value: number; comment?: string; dayOffset: number; time: string };
  }) => {
    const seq = requests.length + 1;
    const createdAt = at(r.steps[0]!.dayOffset, r.steps[0]!.time);
    const id = `req-${String(seq).padStart(4, "0")}`;
    const last = r.steps.at(-1)!;
    requests.push({
      id,
      seq,
      number: `С-${mskYear(createdAt)}-${String(seq).padStart(5, "0")}`,
      studentId: `stu-${r.studentKey}`,
      typeId: requestTypeId(r.type),
      language: r.language,
      payload: r.payload,
      status: last.status,
      createdAt,
      updatedAt: at(last.dayOffset, last.time),
      ...(r.rating
        ? {
            rating: r.rating.value,
            ratingComment: r.rating.comment ?? null,
            ratedAt: at(r.rating.dayOffset, r.rating.time),
          }
        : {}),
    });
    r.steps.forEach((s, i) => {
      requestEvents.push({
        id: `rev-${id}-${i + 1}`,
        requestId: id,
        status: s.status,
        comment: s.comment ?? null,
        // Подаёт студент, дальше — сотрудник деканата
        actorUserId: i === 0 ? `usr-${r.studentKey}` : irina,
        createdAt: at(s.dayOffset, s.time),
      });
    });
    if (last.status === "READY" || last.status === "ISSUED") {
      issuedDocuments.push({
        id: `doc-${id}`,
        requestId: id,
        issuedAt: at(last.dayOffset, last.time),
        validUntil: addDays(today, 90),
        revoked: false,
      });
    }
    return id;
  };

  // Алиса: справка на английском — «Готова» (её можно скачать с QR), и заявка в соцзащиту — «Принята»
  add({
    key: "alisa-en",
    studentKey: "alisa",
    type: "study_en",
    language: "en",
    payload: { addressee: "To whom it may concern" },
    steps: [
      { status: "SUBMITTED", dayOffset: -3, time: "09:12" },
      {
        status: "ACCEPTED",
        dayOffset: -3,
        time: "11:40",
        comment: "Приняли, срок — 3 рабочих дня",
      },
      { status: "IN_PROGRESS", dayOffset: -2, time: "10:05" },
      {
        status: "READY",
        dayOffset: -1,
        time: "16:20",
        comment: "Готова. Заберите в деканате, кабинет 2104",
      },
    ],
  });
  add({
    key: "alisa-social",
    studentKey: "alisa",
    type: "social",
    language: "ru",
    payload: { office: "ОСЗН района Тропарёво-Никулино" },
    steps: [
      { status: "SUBMITTED", dayOffset: -1, time: "20:47" },
      { status: "ACCEPTED", dayOffset: 0, time: "08:30" },
    ],
  });
  // Тимур: справка для военкомата отклонена с понятной причиной
  add({
    key: "timur-military",
    studentKey: "timur",
    type: "military",
    language: "ru",
    payload: { commissariat: "—" },
    steps: [
      { status: "SUBMITTED", dayOffset: -6, time: "13:02" },
      {
        status: "REJECTED",
        dayOffset: -5,
        time: "10:15",
        comment: "Не указан военный комиссариат. Подайте заявку заново и укажите район",
      },
    ],
  });
  // Фоновые заявки для очереди сотрудника (у Ирины — ФМО и МЭО; МЖ и МП ей не видны)
  add({
    key: "savelev",
    studentKey: "savelev",
    type: "study_ru",
    language: "ru",
    payload: { addressee: "По месту работы родителей" },
    steps: [{ status: "SUBMITTED", dayOffset: -4, time: "15:30" }],
  });
  add({
    key: "koroleva",
    studentKey: "koroleva",
    type: "embassy",
    language: "en",
    payload: { country: "Италия", tripDates: "с 28.12.2026 по 08.01.2027" },
    steps: [
      { status: "SUBMITTED", dayOffset: -2, time: "18:10" },
      { status: "IN_PROGRESS", dayOffset: -1, time: "09:45" },
    ],
  });
  add({
    key: "demidov",
    studentKey: "demidov",
    type: "study_ru",
    language: "ru",
    payload: { addressee: "В банк" },
    steps: [{ status: "SUBMITTED", dayOffset: -1, time: "12:00" }],
  });
  add({
    key: "ershova",
    studentKey: "ershova",
    type: "scholarship",
    language: "ru",
    payload: { period: "6 месяцев" },
    steps: [
      { status: "SUBMITTED", dayOffset: -10, time: "10:00" },
      { status: "ACCEPTED", dayOffset: -10, time: "14:00" },
      { status: "READY", dayOffset: -9, time: "12:00" },
      { status: "ISSUED", dayOffset: -8, time: "11:30", comment: "Выдана лично" },
    ],
    rating: { value: 5, comment: "Быстро, спасибо", dayOffset: -8, time: "12:10" },
  });
  // T14: закрытые заявки с оценками студентов ФМО и МЭО — у Ирины сводка «Что говорят студенты».
  // Одна низкая оценка с комментарием про часы приёма → объявление «Вы сказали — мы сделали» (ann-7)
  add({
    key: "savelev-old",
    studentKey: "savelev",
    type: "study_ru",
    language: "ru",
    payload: { addressee: "По месту требования" },
    steps: [
      { status: "SUBMITTED", dayOffset: -24, time: "10:20" },
      { status: "ACCEPTED", dayOffset: -24, time: "13:00" },
      { status: "READY", dayOffset: -23, time: "15:40" },
      { status: "ISSUED", dayOffset: -22, time: "11:05" },
    ],
    rating: {
      value: 4,
      comment: "Хорошо, но за бумажной всё равно ехать",
      dayOffset: -22,
      time: "18:30",
    },
  });
  add({
    key: "koroleva-old",
    studentKey: "koroleva",
    type: "study_en",
    language: "en",
    payload: { addressee: "To whom it may concern" },
    steps: [
      { status: "SUBMITTED", dayOffset: -30, time: "19:45" },
      { status: "ACCEPTED", dayOffset: -29, time: "10:10" },
      { status: "IN_PROGRESS", dayOffset: -28, time: "09:30" },
      { status: "READY", dayOffset: -26, time: "16:00" },
      { status: "ISSUED", dayOffset: -25, time: "12:20" },
    ],
    rating: {
      value: 2,
      comment: "Справка готова, а забрать некогда: приём до 17:00, а я днём на стажировке",
      dayOffset: -25,
      time: "20:15",
    },
  });
  add({
    key: "ershova-old",
    studentKey: "ershova",
    type: "social",
    language: "ru",
    payload: { office: "МФЦ района Раменки" },
    steps: [
      { status: "SUBMITTED", dayOffset: -19, time: "08:50" },
      { status: "ACCEPTED", dayOffset: -19, time: "11:15" },
      { status: "READY", dayOffset: -17, time: "14:30" },
      { status: "ISSUED", dayOffset: -16, time: "10:40" },
    ],
    rating: {
      value: 3,
      comment: "Не сразу понятно, какую справку брать",
      dayOffset: -16,
      time: "21:00",
    },
  });
  add({
    key: "borisov",
    studentKey: "borisov",
    type: "academic",
    language: "ru",
    payload: { reason: "Перевод на другую программу" },
    steps: [{ status: "SUBMITTED", dayOffset: 0, time: "07:55" }],
  });

  // T14+: очередь для пакетной обработки — 4 новых и 4 «в работе» у фоновых студентов ФМО и МЭО
  const submitted: [string, string, string, Record<string, string>, number, string][] = [
    ["zaitsev", "study_ru", "ru", { addressee: "В банк для кредита на обучение" }, -2, "10:30"],
    [
      "nikitina",
      "military",
      "ru",
      { commissariat: "Военный комиссариат Гагаринского района" },
      -1,
      "19:05",
    ],
    ["fomin", "study_ru", "ru", { addressee: "По месту работы мамы" }, 0, "08:10"],
    ["savelev2", "study_ru", "ru", { addressee: "В общежитие" }, -1, "11:20"],
    ["koroleva", "study_ru", "ru", { addressee: "Для стажировки" }, -1, "14:40"],
  ];
  for (const [studentKey, type, language, payload, dayOffset, time] of submitted)
    add({
      key: `${studentKey}-new`,
      studentKey,
      type,
      language,
      payload,
      steps: [{ status: "SUBMITTED", dayOffset, time }],
    });
  const working: [string, string, string, Record<string, string>, number][] = [
    ["zaitsev", "military", "ru", { commissariat: "Военный комиссариат Раменского района" }, -3],
    ["nikitina", "study_en", "en", { addressee: "To whom it may concern" }, -3],
    ["fomin", "social", "ru", { office: "МФЦ района Проспект Вернадского" }, -2],
    ["ershova", "study_ru", "ru", { addressee: "В бассейн" }, -2],
  ];
  for (const [studentKey, type, language, payload, d] of working)
    add({
      key: `${studentKey}-work`,
      studentKey,
      type,
      language,
      payload,
      steps: [
        { status: "SUBMITTED", dayOffset: d, time: "09:40" },
        { status: "ACCEPTED", dayOffset: d, time: "13:15" },
        { status: "IN_PROGRESS", dayOffset: d + 1, time: "10:20" },
      ],
    });
  // T14+: выданная справка с ответом Ирины по существу — из него в демо делают ответ помощника.
  // В комментарии есть имя студента — обезличивание его уберёт
  add({
    key: "savelev-visa",
    studentKey: "savelev",
    type: "embassy",
    language: "en",
    payload: { country: "Франция", tripDates: "с 02.01.2027 по 09.01.2027" },
    steps: [
      { status: "SUBMITTED", dayOffset: -12, time: "11:25" },
      { status: "ACCEPTED", dayOffset: -12, time: "15:00" },
      {
        status: "READY",
        dayOffset: -10,
        time: "12:30",
        comment:
          "Игорь, справка готова. Для визы во Францию консульству достаточно справки на английском — " +
          "её мы и сделали. Перевод на французский деканат не делает: если консульство всё же попросит, " +
          "нужен нотариальный перевод, это 1–2 дня.",
      },
      { status: "ISSUED", dayOffset: -9, time: "10:05" },
    ],
  });

  // Все моменты — не позже «сейчас»: иначе демо показывало бы события из будущего
  for (const e of requestEvents) if (new Date(e.createdAt!) > now) e.createdAt = now;
  for (const r of requests) {
    if (new Date(r.createdAt!) > now) r.createdAt = now;
    if (new Date(r.updatedAt!) > now) r.updatedAt = now;
  }
  for (const d of issuedDocuments) if (new Date(d.issuedAt) > now) d.issuedAt = now;

  return { requests, requestEvents, issuedDocuments };
}

// ── Уведомления ──────────────────────────────────────────────────────────

function buildNotifications({
  at,
  movedText,
}: {
  at: (d: number, t: string) => Date;
  /** «Пара 12:40 перенесена на 17:40.» — из сегодняшнего переноса у Алисы */
  movedText: string;
}): Prisma.NotificationCreateManyInput[] {
  const a = DEMO.alisa.studentId;
  const t = DEMO.timur.studentId;
  // Уведомление-объявление ведёт на доску к своему объявлению (T09, src/server/services/staff-rules.ts)
  const board = (id: string) => `/notifications?tab=announcements#announcement-${id}`;
  return [
    {
      id: "ntf-a1",
      studentId: a,
      kind: "SCHEDULE_CHANGE",
      title: "Перенос пары сегодня",
      body: `${movedText} Подробности — в расписании.`,
      link: "/schedule",
      createdAt: at(0, "07:30"),
    },
    {
      id: "ntf-a2",
      studentId: a,
      kind: "REQUEST_STATUS",
      title: "Справка готова",
      body: "Справка об обучении на английском готова — заберите в деканате.",
      link: "/requests",
      createdAt: at(-1, "16:20"),
    },
    {
      id: "ntf-a3",
      studentId: a,
      kind: "DEADLINE",
      title: "Через 2 дня — эссе по ТМО",
      body: "Срок сдачи эссе по теории международных отношений.",
      link: null,
      createdAt: at(0, "08:00"),
    },
    {
      id: "ntf-a4",
      studentId: a,
      kind: "ANNOUNCEMENT",
      title: "Зимняя сессия: расписание экзаменов",
      body: "Расписание экзаменов и зачётов опубликовано.",
      link: board("ann-1"),
      readAt: at(-1, "12:00"),
      createdAt: at(-1, "10:00"),
    },
    // T09: у Алисы видны и непрочитанное объявление, и прочитанная новость по заявке — вкладки не пустые
    {
      id: "ntf-a5",
      studentId: a,
      kind: "ANNOUNCEMENT",
      title: "Стипендиальная комиссия — документы до пятницы",
      body: "Заявления на повышенную стипендию принимаются через «Заявки».",
      link: board("ann-2"),
      createdAt: at(-3, "12:30"),
    },
    {
      id: "ntf-a6",
      studentId: a,
      kind: "REQUEST_STATUS",
      title: "Заявка принята",
      body: "Справка об обучении на английском: деканат принял заявку.",
      link: "/requests",
      readAt: at(-3, "18:00"),
      createdAt: at(-3, "11:40"),
    },
    {
      id: "ntf-t1",
      studentId: t,
      kind: "REQUEST_STATUS",
      title: "Заявка отклонена",
      body: "Не указан военный комиссариат. Подайте заявку заново и укажите район.",
      link: "/requests",
      createdAt: at(-5, "10:15"),
    },
    {
      id: "ntf-t2",
      studentId: t,
      kind: "DEADLINE",
      // Без «через 3 дня»: если третий день — воскресенье, пересдача на день позже
      title: "Скоро пересдача долга",
      body: "Эконометрика (долг за 6-й семестр), аудитория 1001, начало в 10:00.",
      link: "/grades",
      createdAt: at(0, "08:00"),
    },
    {
      id: "ntf-t3",
      studentId: t,
      kind: "ANNOUNCEMENT",
      title: "Неделя карьеры МЭО",
      body: "Встречи с работодателями в актовом зале.",
      link: board("ann-3"),
      createdAt: at(-2, "09:15"),
    },
  ];
}
