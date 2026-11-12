// Запись вымышленных данных в БД — сама логика, без побочных эффектов при импорте: её берут и CLI
// (prisma/seed.ts), и интеграционные тесты, и «Сбросить демо» в приложении (security-reviewer, T08:
// загрузка .env и проверка «я ли главный скрипт» в серверном бандле не нужны).
// Пароли тестовых аккаунтов — ТОЛЬКО из env (SEED_PASSWORD_*), в коде их нет (S2, хук guard.mjs).
import { randomBytes } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/server/auth/password";
import { buildSeed, SEED_PASSWORD_ENVS } from "./seed-data";

/** Все таблицы — для полного пересева одной командой TRUNCATE (список фиксирован, не из ввода). */
const TABLES = [
  // T14+: база знаний из заявок — ответы, опубликованные в демо, сбрасываются ночным пересевом
  "FaqEntry",
  // T14: «Не сейчас» на предложениях деканата — тоже сбрасывается ночным пересевом демо
  "OfferDismissal",
  "Notification",
  "Deadline",
  "Announcement",
  "IssuedDocument",
  "RequestEvent",
  "Request",
  "RequestType",
  "Grade",
  "Lesson",
  "Discipline",
  "Teacher",
  "Staff",
  "StudentLanguageGroup",
  "Student",
  "LanguageGroup",
  "Group",
  "Program",
  "Faculty",
  "Session",
  // Счётчики входа: ночной пересев снимает и блокировки (security-reviewer, T03)
  "LoginThrottle",
  "User",
] as const;

/** 32 случайных байта — для .ics-токенов; 16 байт (128 бит) — для QR-проверки справок (S7). */
const token = (bytes: number) => randomBytes(bytes).toString("base64url");

export interface SeedOptions {
  now?: Date;
  /** Пароли по имени переменной: по умолчанию берутся из process.env */
  passwords?: Record<string, string | undefined>;
  only?: "schedule";
}

/**
 * Пересев — одна транзакция. Prisma по умолчанию даёт ей 5 с: в CI 12.11 сид (выросший с T14+) уложился в
 * 5,07 с и упал — интеграционные файлы идут параллельно на одной базе, TRUNCATE ждёт блокировку соседа.
 */
const SEED_TX = { maxWait: 15_000, timeout: 60_000 };

export async function runSeed(prisma: PrismaClient, options: SeedOptions = {}) {
  const data = buildSeed(options.now ?? new Date());

  if (options.only === "schedule") {
    await prisma.$transaction(
      [prisma.lesson.deleteMany(), prisma.lesson.createMany({ data: data.lessons })],
      SEED_TX,
    );
    return { lessons: data.lessons.length };
  }

  const passwords = options.passwords ?? process.env;
  const missing = SEED_PASSWORD_ENVS.filter((name) => !passwords[name]);
  if (missing.length > 0) {
    // Значения не печатаем — только имена
    throw new Error(
      `Не заданы пароли тестовых аккаунтов: ${missing.join(", ")}. Добавьте их в .env (шаблон — .env.example).`,
    );
  }
  // Пароли жюри публикуются, но не должны подбираться за секунды: минимум 8 символов, на проде — 12
  const minLength = process.env.NODE_ENV === "production" ? 12 : 8;
  const short = SEED_PASSWORD_ENVS.filter((name) => passwords[name]!.length < minLength);
  if (short.length > 0) {
    throw new Error(
      `Слишком короткие пароли (нужно ≥ ${minLength} символов): ${short.join(", ")}.`,
    );
  }

  const users = await Promise.all(
    data.users.map(async ({ passwordEnv, ...user }) => ({
      ...user,
      // У фоновых студентов пароль никто не знает — войти под ними нельзя
      passwordHash: await hashPassword(passwordEnv ? passwords[passwordEnv]! : token(32)),
    })),
  );
  const students = data.students.map((s) => ({ ...s, calendarToken: token(32) }));
  const issuedDocuments = data.issuedDocuments.map((d) => ({ ...d, verifyToken: token(16) }));

  await prisma.$transaction(
    [
      prisma.$executeRawUnsafe(
        `TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
      ),
      prisma.faculty.createMany({ data: data.faculties }),
      prisma.program.createMany({ data: data.programs }),
      prisma.group.createMany({ data: data.groups }),
      prisma.languageGroup.createMany({ data: data.languageGroups }),
      prisma.user.createMany({ data: users }),
      prisma.student.createMany({ data: students }),
      prisma.studentLanguageGroup.createMany({ data: data.studentLanguageGroups }),
      prisma.staff.createMany({ data: data.staff }),
      prisma.teacher.createMany({ data: data.teachers }),
      prisma.discipline.createMany({ data: data.disciplines }),
      prisma.lesson.createMany({ data: data.lessons }),
      prisma.grade.createMany({ data: data.grades }),
      prisma.requestType.createMany({ data: data.requestTypes }),
      prisma.request.createMany({ data: data.requests }),
      prisma.requestEvent.createMany({ data: data.requestEvents }),
      prisma.issuedDocument.createMany({ data: issuedDocuments }),
      prisma.faqEntry.createMany({ data: data.faqEntries }),
      prisma.announcement.createMany({ data: data.announcements }),
      prisma.deadline.createMany({ data: data.deadlines }),
      prisma.notification.createMany({ data: data.notifications }),
      // seq выставлен явно — двигаем последовательность, чтобы новые заявки (T08) не столкнулись
      prisma.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('"Request"', 'seq'), (SELECT COALESCE(MAX(seq), 1) FROM "Request"))`,
      ),
    ],
    SEED_TX,
  );

  return {
    users: users.length,
    lessons: data.lessons.length,
    grades: data.grades.length,
    requests: data.requests.length,
    notifications: data.notifications.length,
  };
}
