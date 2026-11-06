import "server-only";
import { db } from "@/server/db";
import type { StudentCtx } from "./auth";

// Заявки студента — всегда WHERE studentId = ctx.studentId (S1).

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
