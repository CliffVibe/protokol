import "server-only";
import { db } from "@/server/db";
import type { StudentCtx } from "./auth";

// Уведомления студента — WHERE studentId = ctx.studentId (S1). Минимум для T08 (список);
// вкладки, «прочитано» и бейдж — T09.

export async function notificationsOf(ctx: StudentCtx) {
  return db.notification.findMany({
    where: { studentId: ctx.studentId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      kind: true,
      title: true,
      body: true,
      link: true,
      readAt: true,
      createdAt: true,
    },
  });
}

export type NotificationRow = Awaited<ReturnType<typeof notificationsOf>>[number];
