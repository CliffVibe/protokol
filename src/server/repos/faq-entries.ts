import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { StaffCtx, StudentCtx } from "./auth";

// База знаний из заявок (T14+): ответы деканата, по которым отвечает помощник.
// Сотруднику — только записи своих факультетов (S1: staff.facultyIds), в КАЖДОМ запросе, включая мутации.
// ИСКЛЮЧЕНИЕ — publishedAnswers(): опубликованные ответы читает помощник любого студента. Это не данные
// студентов: обезличенный текст деканата (вопрос, ключевые слова, ответ, дата) — без автора и заявки.

const ofMyFaculties = (ctx: StaffCtx) => ({ facultyId: { in: ctx.facultyIds } });
const requestOfMyFaculties = (ctx: StaffCtx) => ({
  student: { group: { program: { facultyId: { in: ctx.facultyIds } } } },
});
const PERSON = { select: { lastName: true, firstName: true, middleName: true } } as const;

/** Черновики своих факультетов — для утреннего брифинга. */
export function countFaqDrafts(ctx: StaffCtx) {
  return db.faqEntry.count({ where: { ...ofMyFaculties(ctx), published: false } });
}

/**
 * Заявка-источник для черновика: тип, студент (только ФИО — для обезличивания), факультет и последний
 * комментарий сотрудника (не причина отказа: её пишут конкретному студенту). Чужой факультет → null.
 */
export async function requestForFaq(ctx: StaffCtx, number: string) {
  const r = await db.request.findFirst({
    where: { number, ...requestOfMyFaculties(ctx) },
    select: {
      id: true,
      type: { select: { title: true } },
      student: {
        select: {
          ...PERSON.select,
          group: { select: { program: { select: { facultyId: true } } } },
        },
      },
      events: {
        where: { comment: { not: null }, status: { not: "REJECTED" }, actor: { role: "STAFF" } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { comment: true },
      },
      faqEntry: { select: { id: true } },
    },
  });
  return r;
}

/** Создать черновик; на одну заявку — одна запись (повторное нажатие или гонка → та же). */
export async function createFaqDraft(
  ctx: StaffCtx,
  data: {
    facultyId: string;
    sourceRequestId: string;
    title: string;
    keywords: string;
    body: string;
  },
): Promise<string> {
  if (!ctx.facultyIds.includes(data.facultyId)) throw new Error("faq: чужой факультет");
  try {
    const e = await db.faqEntry.create({
      data: { ...data, createdByUserId: ctx.userId },
      select: { id: true },
    });
    return e.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const e = await db.faqEntry.findUniqueOrThrow({
        where: { sourceRequestId: data.sourceRequestId },
        select: { id: true },
      });
      return e.id;
    }
    throw err;
  }
}

/** Список своих факультетов: черновики сверху, дальше опубликованные — новые выше. */
export function faqEntriesOf(ctx: StaffCtx) {
  return db.faqEntry.findMany({
    where: ofMyFaculties(ctx),
    orderBy: [{ published: "asc" }, { updatedAt: "desc" }],
    take: 200,
    select: {
      id: true,
      title: true,
      published: true,
      publishedAt: true,
      updatedAt: true,
      faculty: { select: { code: true } },
    },
  });
}

/** Запись своего факультета для редактора; источник — номер, тип и ФИО (проверка перед публикацией). */
export function faqEntryOf(ctx: StaffCtx, id: string) {
  return db.faqEntry.findFirst({
    where: { id, ...ofMyFaculties(ctx) },
    select: {
      id: true,
      title: true,
      keywords: true,
      body: true,
      published: true,
      publishedAt: true,
      updatedAt: true,
      faculty: { select: { code: true } },
      sourceRequest: {
        select: { number: true, type: { select: { title: true } }, student: PERSON },
      },
    },
  });
}

/** Сохранить / опубликовать / снять. false — чужая или нет такой (без различий). */
export async function updateFaqEntry(
  ctx: StaffCtx,
  id: string,
  data: { title: string; keywords: string; body: string; published: boolean },
  now: Date,
): Promise<boolean> {
  const { count } = await db.faqEntry.updateMany({
    where: { id, ...ofMyFaculties(ctx) },
    data: {
      title: data.title,
      keywords: data.keywords,
      body: data.body,
      published: data.published,
      publishedAt: data.published ? now : null,
    },
  });
  return count === 1;
}

export async function deleteFaqEntry(ctx: StaffCtx, id: string): Promise<boolean> {
  const { count } = await db.faqEntry.deleteMany({ where: { id, ...ofMyFaculties(ctx) } });
  return count === 1;
}

/**
 * Для помощника (см. исключение выше): только опубликованное и только текст с датой. ctx — чтобы вызвать
 * мог только вошедший студент; данных о нём запрос не берёт.
 */
export function publishedAnswers(_ctx: StudentCtx, limit = 200) {
  return db.faqEntry.findMany({
    where: { published: true },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: { id: true, title: true, keywords: true, body: true, publishedAt: true },
  });
}
