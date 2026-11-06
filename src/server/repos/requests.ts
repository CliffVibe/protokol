import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { mskYear } from "@/lib/msk";
import { db } from "@/server/db";
import { formatRequestNumber } from "@/server/services/request-rules";
import type { StudentCtx } from "./auth";

// Заявки студента — всегда WHERE studentId = ctx.studentId (S1). Номер из адреса ищется только вместе
// со studentId: чужая заявка неотличима от несуществующей (→ 404).
// Мутации — updateMany с владельцем и ожидаемым статусом и проверкой count === 1 (security-ревью T02),
// заявки не удаляются никогда.

const ACTIVE = ["SUBMITTED", "ACCEPTED", "IN_PROGRESS", "READY"] as const;

export async function activeRequests(ctx: StudentCtx) {
  return db.request.findMany({
    where: { studentId: ctx.studentId, status: { in: [...ACTIVE] } },
    orderBy: { updatedAt: "desc" },
    select: {
      number: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      type: { select: { title: true, slaDays: true } },
    },
  });
}

export type RequestRow = Awaited<ReturnType<typeof activeRequests>>[number];

/** Все заявки студента — для «Активные / Архив». */
export async function requestsOf(ctx: StudentCtx): Promise<RequestRow[]> {
  return db.request.findMany({
    where: { studentId: ctx.studentId },
    orderBy: { updatedAt: "desc" },
    select: {
      number: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      type: { select: { title: true, slaDays: true } },
    },
  });
}

/** Одна заявка по номеру — только своя. Кто из деканата менял статус, студенту не показываем. */
export async function requestByNumber(ctx: StudentCtx, number: string) {
  return db.request.findFirst({
    where: { number, studentId: ctx.studentId },
    select: {
      number: true,
      status: true,
      language: true,
      payload: true,
      createdAt: true,
      updatedAt: true,
      type: { select: { title: true, slaDays: true, fields: true } },
      events: {
        orderBy: { createdAt: "asc" },
        select: { status: true, comment: true, createdAt: true },
      },
    },
  });
}

export type RequestDetails = NonNullable<Awaited<ReturnType<typeof requestByNumber>>>;

const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/**
 * Новая заявка студента: номер из последовательности seq в той же транзакции (без гонок),
 * событие «Подана» от самого студента. Повтор с тем же clientKey (двойной клик) — номер уже созданной.
 */
export async function createRequest(
  ctx: StudentCtx,
  input: { typeId: string; language: string; payload: Record<string, string>; clientKey: string },
): Promise<string> {
  try {
    return await db.$transaction(async (tx) => {
      // Фиксированный SQL без ввода
      const [row] = await tx.$queryRaw<{ seq: bigint }[]>`
        SELECT nextval(pg_get_serial_sequence('"Request"', 'seq')) AS seq`;
      const seq = Number(row!.seq);
      const created = await tx.request.create({
        data: {
          seq,
          number: formatRequestNumber(mskYear(new Date()), seq),
          studentId: ctx.studentId,
          typeId: input.typeId,
          language: input.language,
          payload: input.payload,
          clientKey: input.clientKey,
        },
        select: { id: true, number: true },
      });
      await tx.requestEvent.create({
        data: { requestId: created.id, status: "SUBMITTED", actorUserId: ctx.userId },
      });
      return created.number;
    });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const existing = await db.request.findFirst({
      where: { studentId: ctx.studentId, clientKey: input.clientKey },
      select: { number: true },
    });
    if (!existing) throw e;
    return existing.number;
  }
}

/**
 * Отмена своей заявки, пока она «Подана». false — нет такой своей заявки или её уже взяли в работу:
 * снаружи эти случаи не различаем (не подтверждаем существование чужой).
 */
export async function cancelRequest(ctx: StudentCtx, number: string): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const own = await tx.request.findFirst({
      where: { number, studentId: ctx.studentId },
      select: { id: true },
    });
    if (!own) return false;
    const { count } = await tx.request.updateMany({
      where: { id: own.id, studentId: ctx.studentId, status: "SUBMITTED" },
      data: { status: "CANCELLED" },
    });
    if (count !== 1) return false;
    await tx.requestEvent.create({
      data: { requestId: own.id, status: "CANCELLED", actorUserId: ctx.userId },
    });
    return true;
  });
}

/** Каталог типов: общий для всех, ctx — чтобы читать его только из-под guard. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- ctx не нужен запросу: каталог общий
export async function requestTypes(ctx: StudentCtx) {
  return db.requestType.findMany({
    orderBy: { title: "asc" },
    select: {
      id: true,
      code: true,
      title: true,
      description: true,
      languages: true,
      slaDays: true,
      fields: true,
    },
  });
}

export type RequestTypeRow = Awaited<ReturnType<typeof requestTypes>>[number];
