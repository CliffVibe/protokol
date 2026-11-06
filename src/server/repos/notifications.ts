import "server-only";
import type { NotificationKind } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { StudentCtx } from "./auth";

// Уведомления студента (T08 → T09). КАЖДЫЙ запрос — с studentId: ctx.studentId (S1), включая мутации:
// чужой id из формы просто не найдётся (count 0), а не отметит чужое уведомление.

const SELECT = {
  id: true,
  kind: true,
  title: true,
  body: true,
  link: true,
  readAt: true,
  createdAt: true,
} as const;

export async function notificationsOf(ctx: StudentCtx, kind?: NotificationKind) {
  return db.notification.findMany({
    where: { studentId: ctx.studentId, ...(kind ? { kind } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: SELECT,
  });
}

export type NotificationRow = Awaited<ReturnType<typeof notificationsOf>>[number];

export function unreadCountOf(ctx: StudentCtx): Promise<number> {
  return db.notification.count({ where: { studentId: ctx.studentId, readAt: null } });
}

/** Непрочитанные по видам — для чисел на вкладках. */
export async function unreadByKind(
  ctx: StudentCtx,
): Promise<Partial<Record<NotificationKind, number>>> {
  const rows = await db.notification.groupBy({
    by: ["kind"],
    where: { studentId: ctx.studentId, readAt: null },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [r.kind, r._count._all]));
}

/**
 * Открыть уведомление: отметить прочитанным и вернуть его ссылку.
 * Своё — `{ link }` (ссылка может быть null); чужое или несуществующее — null.
 */
export async function markRead(
  ctx: StudentCtx,
  id: string,
  now: Date = new Date(),
): Promise<{ link: string | null } | null> {
  const n = await db.notification.findFirst({
    where: { id, studentId: ctx.studentId },
    select: { link: true },
  });
  if (!n) return null;
  await db.notification.updateMany({
    where: { id, studentId: ctx.studentId, readAt: null },
    data: { readAt: now },
  });
  return n;
}

/** «Отметить прочитанными» — на вкладке только её вид (ux-reviewer T09: не гасить то, чего человек не видел). */
export async function markAllRead(
  ctx: StudentCtx,
  kind?: NotificationKind,
  now: Date = new Date(),
): Promise<number> {
  const { count } = await db.notification.updateMany({
    where: { studentId: ctx.studentId, readAt: null, ...(kind ? { kind } : {}) },
    data: { readAt: now },
  });
  return count;
}

const BOARD_ANCHOR = /#announcement-([A-Za-z0-9%-]{1,120})$/;

/** id объявлений, уведомления о которых студент ещё не открыл, — для метки «Новое» на доске. */
export async function unreadAnnouncementIds(ctx: StudentCtx): Promise<Set<string>> {
  const rows = await db.notification.findMany({
    where: { studentId: ctx.studentId, kind: "ANNOUNCEMENT", readAt: null },
    select: { link: true },
    take: 200,
  });
  const ids = new Set<string>();
  for (const r of rows) {
    const m = r.link ? BOARD_ANCHOR.exec(r.link) : null;
    if (m) {
      try {
        ids.add(decodeURIComponent(m[1]!));
      } catch {
        // битая %-последовательность — просто без метки
      }
    }
  }
  return ids;
}
