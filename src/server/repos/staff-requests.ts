import "server-only";
import { randomBytes } from "node:crypto";
import type { RequestStatus } from "@/generated/prisma/client";
import { assertLink } from "@/lib/links";
import { addDays } from "@/lib/msk";
import { db } from "@/server/db";
import { notificationFor, requestHref } from "@/server/services/request-rules";
import type { StaffCtx } from "./auth";

// Заявки для сотрудника деканата — только студентов его факультетов (S1: staff.facultyIds).
// Фильтр по факультету — в КАЖДОМ запросе, включая мутации. Данные студента — явным select:
// ФИО, группа, курс, факультет. Без recordBookNo, calendarToken и пользователя (security-ревью T02).

const ofMyFaculties = (ctx: StaffCtx) => ({
  student: { group: { program: { facultyId: { in: ctx.facultyIds } } } },
});

const STUDENT_SELECT = {
  lastName: true,
  firstName: true,
  middleName: true,
  group: {
    select: {
      name: true,
      course: true,
      program: { select: { faculty: { select: { id: true, code: true, name: true } } } },
    },
  },
} as const;

export type QueueFilters = {
  statuses: RequestStatus[];
  /** Уже проверено: один из ctx.facultyIds */
  facultyId: string | null;
  typeCode: string | null;
};

export async function queueFor(ctx: StaffCtx, f: QueueFilters) {
  // Один фильтр по факультетам: выбранный — только если он среди своих, иначе все свои
  const allowed = f.facultyId ? ctx.facultyIds.filter((id) => id === f.facultyId) : ctx.facultyIds;
  return db.request.findMany({
    where: {
      student: { group: { program: { facultyId: { in: allowed } } } },
      status: { in: f.statuses },
      ...(f.typeCode ? { type: { code: f.typeCode } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: {
      number: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      offered: true,
      type: { select: { title: true, code: true, slaDays: true } },
      student: { select: STUDENT_SELECT },
    },
  });
}

export type QueueRow = Awaited<ReturnType<typeof queueFor>>[number];

/** Факультеты сотрудника и типы — для фильтров очереди. */
export async function queueOptions(ctx: StaffCtx) {
  const [faculties, types] = await Promise.all([
    db.faculty.findMany({
      where: { id: { in: ctx.facultyIds } },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    db.requestType.findMany({ orderBy: { title: "asc" }, select: { code: true, title: true } }),
  ]);
  return { faculties, types };
}

/** Карточка заявки — только своего факультета; иначе null (→ 404). */
export async function staffRequestByNumber(ctx: StaffCtx, number: string) {
  return db.request.findFirst({
    where: { number, ...ofMyFaculties(ctx) },
    select: {
      number: true,
      status: true,
      language: true,
      payload: true,
      createdAt: true,
      updatedAt: true,
      offered: true,
      type: { select: { title: true, slaDays: true, fields: true } },
      student: { select: STUDENT_SELECT },
      // Справка (T10): срок, ссылка проверки и отзыв
      document: {
        select: {
          verifyToken: true,
          issuedAt: true,
          validUntil: true,
          revoked: true,
          revokedAt: true,
          revokedReason: true,
        },
      },
      events: {
        orderBy: { createdAt: "asc" },
        select: {
          status: true,
          comment: true,
          createdAt: true,
          actor: { select: { role: true, staff: { select: { fullName: true } } } },
        },
      },
    },
  });
}

export type StaffRequestDetails = NonNullable<Awaited<ReturnType<typeof staffRequestByNumber>>>;

export type ChangeResult = "ok" | "not_found" | "conflict";

/**
 * Смена статуса сотрудником. Переход проверяет сервис (canTransition); здесь — владение факультетом
 * и «статус всё ещё from» в одном updateMany (два сотрудника разом → второй получает conflict).
 * В той же транзакции: событие, уведомление студенту, при «Готова» — документ с токеном 128 бит (S7).
 */
export async function changeStatus(
  ctx: StaffCtx,
  input: { number: string; from: RequestStatus; to: RequestStatus; comment: string | null },
): Promise<ChangeResult> {
  return db.$transaction(async (tx) => {
    const r = await tx.request.findFirst({
      where: { number: input.number, ...ofMyFaculties(ctx) },
      select: { id: true, studentId: true, type: { select: { title: true } } },
    });
    if (!r) return "not_found";
    const { count } = await tx.request.updateMany({
      where: { id: r.id, status: input.from, ...ofMyFaculties(ctx) },
      data: { status: input.to },
    });
    if (count !== 1) return "conflict";
    await tx.requestEvent.create({
      data: { requestId: r.id, status: input.to, comment: input.comment, actorUserId: ctx.userId },
    });
    const n = notificationFor(input.to, r.type.title, input.comment);
    await tx.notification.create({
      data: {
        studentId: r.studentId,
        kind: "REQUEST_STATUS",
        title: n.title,
        body: n.body,
        link: assertLink(requestHref(input.number)),
      },
    });
    if (input.to === "READY") {
      const now = new Date();
      await tx.issuedDocument.create({
        data: {
          requestId: r.id,
          verifyToken: randomBytes(16).toString("base64url"),
          issuedAt: now,
          validUntil: addDays(now, 90),
        },
      });
    }
    return "ok";
  });
}

export type RevokeResult = "ok" | "not_found" | "conflict";

/**
 * Отзыв справки сотрудником (T10). Только заявка своего факультета (S1) — и при поиске, и в самом
 * updateMany; «ещё не отозвана» — там же: два сотрудника разом → второй получает conflict.
 * В той же транзакции — уведомление студенту. Причину видит студент; на /verify — только «Отозвана».
 */
export async function revokeDocument(
  ctx: StaffCtx,
  input: { number: string; reason: string },
): Promise<RevokeResult> {
  return db.$transaction(async (tx) => {
    const r = await tx.request.findFirst({
      where: { number: input.number, ...ofMyFaculties(ctx) },
      select: {
        studentId: true,
        type: { select: { title: true } },
        document: { select: { id: true } },
      },
    });
    if (!r?.document) return "not_found";
    const { count } = await tx.issuedDocument.updateMany({
      where: { id: r.document.id, revoked: false, request: { is: ofMyFaculties(ctx) } },
      data: {
        revoked: true,
        revokedAt: new Date(),
        revokedReason: input.reason,
        revokedByUserId: ctx.userId,
      },
    });
    if (count !== 1) return "conflict";
    await tx.notification.create({
      data: {
        studentId: r.studentId,
        kind: "REQUEST_STATUS",
        title: "Справка отозвана",
        body: `${r.type.title}: деканат отозвал справку. ${input.reason}`,
        link: assertLink(requestHref(input.number)),
      },
    });
    return "ok";
  });
}

/**
 * Оценки студентов своих факультетов (T14, «Вы сказали — мы сделали»): для сводки в очереди.
 * Без ФИО и номеров — только тип справки, оценка, комментарий и дата: отзыв анонимен для сотрудника.
 */
export async function ratingsOf(ctx: StaffCtx) {
  return db.request.findMany({
    where: { ...ofMyFaculties(ctx), rating: { not: null } },
    orderBy: { ratedAt: "desc" },
    take: 500,
    select: {
      rating: true,
      ratingComment: true,
      ratedAt: true,
      type: { select: { code: true, title: true } },
    },
  });
}
