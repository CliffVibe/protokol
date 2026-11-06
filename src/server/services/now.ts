import "server-only";
import type { RequestStatus } from "@/generated/prisma/client";
import { matchesAudience } from "@/lib/audience";
import { addDays, mskStartOfDay } from "@/lib/msk";
import type { StudentCtx } from "@/server/auth/guards";
import { recentAnnouncements, upcomingDeadlines } from "@/server/repos/announcements";
import { gradesOf } from "@/server/repos/grades";
import { readerOf } from "@/server/repos/profile";
import { activeRequests, type RequestRow } from "@/server/repos/requests";
import { lessonsBetween, type LessonRow } from "@/server/repos/schedule";
import { summarizeStudy, type StudySummary } from "./academics";

// Главная «Сейчас» (T05): всё, что важно студенту в эту минуту, одной функцией.
// Все запросы — параллельно и только через репозитории с ctx (S1).

const DAY_MS = 24 * 60 * 60 * 1000;
/** На сколько дней вперёд ищем ближайшую пару, если сегодня всё прошло. */
const LOOKAHEAD_DAYS = 8;
const SOON_LIMIT = 3;

export type NextLesson = { lesson: LessonRow; state: "ongoing" | "upcoming" };

export type SoonItem = {
  id: string;
  kind: "deadline" | "exam";
  title: string;
  at: Date;
};

export type FeedRequest = RequestRow & { dueAt: Date };

export type NowFeed = {
  firstName: string;
  next: NextLesson | null;
  changes: LessonRow[];
  soon: SoonItem[];
  requests: FeedRequest[];
  announcements: { id: string; title: string; body: string; publishedAt: Date; pinned: boolean }[];
  study: StudySummary | null;
};

/** Идущая сейчас или ближайшая пара; отменённые не считаются. */
export function pickNext(lessons: LessonRow[], now: Date): NextLesson | null {
  const live = lessons.filter((l) => l.change !== "CANCELLED");
  const ongoing = live.find((l) => l.startsAt <= now && now < l.endsAt);
  if (ongoing) return { lesson: ongoing, state: "ongoing" };
  const upcoming = live.find((l) => l.startsAt > now);
  return upcoming ? { lesson: upcoming, state: "upcoming" } : null;
}

/** Переносы, отмены, смены аудитории и преподавателя — на сегодня и завтра. */
export function pickChanges(lessons: LessonRow[], now: Date): LessonRow[] {
  const from = mskStartOfDay(now);
  const to = addDays(from, 2);
  return lessons.filter((l) => l.change !== "NONE" && l.startsAt >= from && l.startsAt < to);
}

/** «Готова — заберите» первой, дальше — по последнему изменению. */
export function sortRequests(rows: RequestRow[]): FeedRequest[] {
  const rank = (s: RequestStatus) => (s === "READY" ? 0 : 1);
  return rows
    .map((r) => ({ ...r, dueAt: new Date(r.createdAt.getTime() + r.type.slaDays * DAY_MS) }))
    .sort((a, b) => rank(a.status) - rank(b.status) || +b.updatedAt - +a.updatedAt);
}

export async function getNowFeed(ctx: StudentCtx, now: Date = new Date()): Promise<NowFeed | null> {
  const today = mskStartOfDay(now);
  const [reader, lessons, requests, grades, announcements, deadlines] = await Promise.all([
    readerOf(ctx),
    lessonsBetween(ctx, today, addDays(today, LOOKAHEAD_DAYS)),
    activeRequests(ctx),
    gradesOf(ctx),
    recentAnnouncements(ctx, now),
    upcomingDeadlines(ctx, now),
  ]);
  if (!reader) return null;

  const forMe = <T extends { audience: unknown }>(rows: T[]) =>
    rows.filter((r) => matchesAudience(r.audience, reader));

  const exams: SoonItem[] = grades
    .filter((g) => g.examDate && g.examDate >= now)
    .map((g) => ({
      id: `exam-${g.discipline.id}-${g.semester}`,
      kind: "exam",
      title: g.discipline.name,
      at: g.examDate!,
    }));
  const dues: SoonItem[] = forMe(deadlines).map((d) => ({
    id: d.id,
    kind: "deadline",
    title: d.title,
    at: d.dueAt,
  }));
  const soon = [...exams, ...dues].sort((a, b) => +a.at - +b.at).slice(0, SOON_LIMIT);

  const mine = forMe(announcements);
  const pinned = mine.filter((a) => a.pinned);
  const latest = mine.find((a) => !a.pinned);
  const shownAnnouncements = [...pinned, ...(latest ? [latest] : [])].map(
    ({ id, title, body, publishedAt, pinned: p }) => ({ id, title, body, publishedAt, pinned: p }),
  );

  return {
    firstName: reader.firstName,
    next: pickNext(lessons, now),
    changes: pickChanges(lessons, now),
    soon,
    requests: sortRequests(requests),
    announcements: shownAnnouncements,
    study: summarizeStudy(grades),
  };
}
