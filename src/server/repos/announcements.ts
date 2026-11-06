import "server-only";
import { db } from "@/server/db";
import type { StudentCtx } from "./auth";

// Свежие объявления и дедлайны деканата. Адресат — в поле audience; кому показать, решает
// services/now.ts → matchesAudience по факультету, курсу и группе ИЗ ctx (repos/profile.ts → readerOf).
// Данных других студентов здесь нет: объявления общие, адресованы группам и факультетам.

export async function recentAnnouncements(_ctx: StudentCtx, now: Date) {
  return db.announcement.findMany({
    where: { publishedAt: { lte: now } },
    orderBy: { publishedAt: "desc" },
    take: 50,
    select: { id: true, title: true, body: true, publishedAt: true, pinned: true, audience: true },
  });
}

export async function upcomingDeadlines(_ctx: StudentCtx, from: Date) {
  return db.deadline.findMany({
    where: { dueAt: { gte: from } },
    orderBy: { dueAt: "asc" },
    take: 50,
    select: { id: true, title: true, dueAt: true, link: true, audience: true },
  });
}
