import "server-only";
import { matchesAudience } from "@/lib/audience";
import { db } from "@/server/db";
import type { StudentCtx } from "./auth";
import { readerOf } from "./profile";

// Объявления и дедлайны деканата — ТОЛЬКО адресованные этому студенту (S1).
// Фильтр по адресату — здесь, в репозитории, а не у вызывающего: следующий потребитель
// (уведомления T09, ИИ-помощник T12) не сможет его забыть (security-reviewer, T05).
// Адресат — факультет, курс и группа студента из ctx (repos/profile.ts → readerOf).

/** Сколько свежих записей просматриваем до фильтра — с запасом, чтобы чужие не вытеснили свои. */
const SCAN = 300;

export async function announcementsFor(ctx: StudentCtx, now: Date) {
  const [reader, rows] = await Promise.all([
    readerOf(ctx),
    db.announcement.findMany({
      where: { publishedAt: { lte: now } },
      orderBy: { publishedAt: "desc" },
      take: SCAN,
      select: {
        id: true,
        title: true,
        body: true,
        publishedAt: true,
        pinned: true,
        youSaid: true,
        audience: true,
      },
    }),
  ]);
  if (!reader) return [];
  return rows
    .filter((r) => matchesAudience(r.audience, reader))
    .map(({ id, title, body, publishedAt, pinned, youSaid }) => ({
      id,
      title,
      body,
      publishedAt,
      pinned,
      youSaid,
    }));
}

export async function deadlinesFor(ctx: StudentCtx, from: Date) {
  const [reader, rows] = await Promise.all([
    readerOf(ctx),
    db.deadline.findMany({
      where: { dueAt: { gte: from } },
      orderBy: { dueAt: "asc" },
      take: SCAN,
      select: { id: true, title: true, dueAt: true, link: true, audience: true },
    }),
  ]);
  if (!reader) return [];
  return rows
    .filter((r) => matchesAudience(r.audience, reader))
    .map(({ id, title, dueAt, link }) => ({ id, title, dueAt, link }));
}
