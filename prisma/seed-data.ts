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
  "Гусев Дмитрий Алексеевич",
  "Комарова Ольга Игоревна",
  "Тихонов Сергей Николаевич",
  "Орлова Наталья Петровна",
  "Мельников Артём Владимирович",
  "Ковалёва Дарья Александровна",
  "Пестов Роман Ильич",
] as const;
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
  "dsc-fr": 1,
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
    disciplines: ["dsc-tmo", "dsc-hist", "dsc-protocol", "dsc-intlaw", "dsc-philos"],
  },
  {
    id: "grp-2mo1",
    name: "2МО-1",
    course: 2,
    program: "prg-mo",
    disciplines: ["dsc-tmo", "dsc-hist", "dsc-protocol", "dsc-intlaw", "dsc-philos"],
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
    days: [2, 4],
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
        label: "Addressee (to whom it may concern)",
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
      { name: "country", label: "Страна", type: "text", required: true, maxLength: 80 },
      { name: "tripDates", label: "Даты поездки", type: "text", required: true, maxLength: 80 },
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
] as const;
const requestTypeId = (code: string) => `rqt-${code}`;

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
  const grades = buildGrades({ today, at });

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

  // ── Объявления, дедлайны, уведомления ──
  const audience = (a: Audience) => a as Prisma.InputJsonValue;
  const announcements = [
    {
      id: "ann-1",
      title: "Зимняя сессия: расписание экзаменов",
      body: "Расписание экзаменов и зачётов опубликовано в разделе «Учёба». Проверьте даты и аудитории.",
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
      body: "Встречи с работодателями в актовом зале. Регистрация — по ссылке в объявлении.",
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
      dueAt: at(5, "18:00"),
      audience: audience({ facultyCodes: ["ФМО", "МЭО"] }),
      link: "/requests/new",
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
  const notifications = buildNotifications({ at });

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
  const room = () => String(rng.int(1, 5) * 1000 + rng.int(10, 60));

  // Недельный шаблон: одинаковый каждую неделю, как настоящее расписание
  type Slot = {
    weekday: number;
    slot: number;
    discipline: DisciplineId;
    kind: "LECTURE" | "SEMINAR";
    building: string;
    room: string;
  };
  const templates = new Map<string, Slot[]>();
  for (const g of GROUPS) {
    const slots: Slot[] = [];
    const isAlisa = g.id === ALISA_GROUP;
    for (let weekday = 1; weekday <= 6; weekday++) {
      // У 2МО-3 пары каждый учебный день (пн–сб) в слотах 0–2: языковые группы Алисы — в слотах 3–4
      const count = isAlisa
        ? weekday === 6
          ? 2
          : 3
        : weekday === 6
          ? rng.int(0, 1)
          : rng.int(2, 3);
      for (let i = 0; i < count; i++) {
        const discipline = rng.pick(g.disciplines);
        slots.push({
          weekday,
          slot: i,
          discipline,
          kind: i === 0 ? "LECTURE" : "SEMINAR",
          building: MAIN,
          room: room(),
        });
      }
    }
    if (isAlisa) {
      // Четверг: вторая пара в Одинцове — для подсказки «переход между корпусами» (T06)
      const thu = slots.find((s) => s.weekday === 4 && s.slot === 1);
      if (thu) thu.building = ODINTSOVO;
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
        if (isToday && g.id === ALISA_GROUP && daySlots.length < 2) {
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
              discipline: "dsc-protocol",
              kind: "SEMINAR",
              building: MAIN,
              room: "2118",
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

  // Экзамен у Тимура через 3 дня (06-seed-data: «экзамен через 3 дня»)
  const examDay = addDays(today, 3);
  push({
    idKey: `grp-4meo1-exam-${mskDateKey(examDay)}`,
    disciplineId: "dsc-worldec",
    teacherId: teacherId(DISCIPLINE_TEACHER["dsc-worldec"]),
    kind: "EXAM",
    startsAt: mskAt(examDay, "10:00"),
    endsAt: mskAt(examDay, "13:00"),
    building: MAIN,
    room: "1001",
    groupId: "grp-4meo1",
  });

  // В день экзамена у 4МЭО-1 обычных пар нет: экзамен 10:00–13:00 иначе накладывался на пары
  // 09:00 и 10:40 (ux-reviewer, T06)
  const examKey = mskDateKey(examDay);
  for (let i = lessons.length - 1; i >= 0; i--) {
    const l = lessons[i]!;
    if (
      l.groupId === "grp-4meo1" &&
      l.kind !== "EXAM" &&
      mskDateKey(new Date(l.startsAt)) === examKey
    )
      lessons.splice(i, 1);
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

  // 1) Сегодня у Алисы: первая пара переносится на вечер
  const todays = onDay(ALISA_GROUP, today);
  const first = todays[0];
  if (!first) throw new Error("У 2МО-3 нет пар сегодня — нарушено правило «сегодня учебный день»");
  moveLater(first, "Преподаватель на конференции");

  // 2) Ещё один перенос и одна отмена у Алисы на этой неделе — в другие дни (пн–сб, не сегодня)
  const otherDays = [1, 2, 3, 4, 5, 6]
    .filter((d) => d !== todayWeekday)
    .map((d) => addDays(weekStart, d - 1));
  const movedDay = otherDays[0]!;
  const cancelledDay = otherDays[1]!;
  const moved = onDay(ALISA_GROUP, movedDay)[0];
  if (moved) moveLater(moved, "По просьбе кафедры");
  const cancelled = onDay(ALISA_GROUP, cancelledDay).at(-1);
  if (cancelled) {
    cancelled.change = "CANCELLED";
    cancelled.changeNote = "Занятие отработаем на консультации";
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
    nextWeek.teacherId = teacherId(10);
  }
}

// ── Оценки ───────────────────────────────────────────────────────────────

function buildGrades({
  today,
  at,
}: {
  today: Date;
  at: (d: number, t: string) => Date;
}): Prisma.GradeCreateManyInput[] {
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

  // Алиса, 2 курс: семестры 1–2 закрыты на 4–5, текущий 3-й — рейтинг в процессе. Стипендия сохраняется.
  const a = DEMO.alisa.studentId;
  add(a, "dsc-hist", 1, {
    kind: "EXAM",
    finalMark: 5,
    ratingPoints: 91,
    examDate: new Date(Date.UTC(sessionYear - 1, 0, 15, 7)),
  });
  add(a, "dsc-philos", 1, { kind: "CREDIT", passed: true, ratingPoints: 84 });
  add(a, "dsc-en", 1, { kind: "GRADED_CREDIT", finalMark: 5, ratingPoints: 93 });
  add(a, "dsc-tmo", 2, {
    kind: "EXAM",
    finalMark: 4,
    ratingPoints: 78,
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

  // Тимур, 4 курс: долг по эконометрике (6-й семестр), экзамен по мировой экономике через 3 дня,
  // «Международные финансы» 54/100 — стипендия под угрозой.
  const t = DEMO.timur.studentId;
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
    examDate: new Date(Date.UTC(sessionYear - 1, 5, 20, 7)),
  });
  add(t, "dsc-rufp", 6, { kind: "CREDIT", passed: true, ratingPoints: 66 });
  add(t, "dsc-worldec", 7, { kind: "EXAM", ratingPoints: 61, examDate: at(3, "10:00") });
  add(t, "dsc-finance", 7, { kind: "EXAM", ratingPoints: 54, examDate: sessionDay(20) });
  add(t, "dsc-ecmetr", 7, { kind: "GRADED_CREDIT", ratingPoints: 68 });
  add(t, "dsc-en", 7, { kind: "GRADED_CREDIT", ratingPoints: 80 });

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
        comment: "Готова. Электронная версия с QR — в карточке заявки",
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
    payload: { country: "Италия", tripDates: "28.12 — 08.01" },
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
  });
  add({
    key: "borisov",
    studentKey: "borisov",
    type: "academic",
    language: "ru",
    payload: { reason: "Перевод на другую программу" },
    steps: [{ status: "SUBMITTED", dayOffset: 0, time: "07:55" }],
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
}: {
  at: (d: number, t: string) => Date;
}): Prisma.NotificationCreateManyInput[] {
  const a = DEMO.alisa.studentId;
  const t = DEMO.timur.studentId;
  return [
    {
      id: "ntf-a1",
      studentId: a,
      kind: "SCHEDULE_CHANGE",
      title: "Перенос пары сегодня",
      body: "Первая пара перенесена на 17:40. Подробности — в расписании.",
      link: "/schedule",
      createdAt: at(0, "07:30"),
    },
    {
      id: "ntf-a2",
      studentId: a,
      kind: "REQUEST_STATUS",
      title: "Справка готова",
      body: "Справка об обучении на английском готова — заберите или скачайте PDF.",
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
      link: "/notifications",
      readAt: at(-1, "12:00"),
      createdAt: at(-1, "10:00"),
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
      title: "Через 3 дня — экзамен",
      body: "Мировая экономика, аудитория 1001, начало в 10:00.",
      link: "/grades",
      createdAt: at(0, "08:00"),
    },
    {
      id: "ntf-t3",
      studentId: t,
      kind: "ANNOUNCEMENT",
      title: "Неделя карьеры МЭО",
      body: "Встречи с работодателями в актовом зале.",
      link: "/notifications",
      createdAt: at(-2, "09:15"),
    },
  ];
}
