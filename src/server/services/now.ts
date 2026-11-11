import "server-only";
import type { RequestStatus } from "@/generated/prisma/client";
import { addBusinessDays, addDays, mskStartOfDay, mskStartOfWeek } from "@/lib/msk";
import type { StudentCtx } from "@/server/auth/guards";
import { announcementsFor, deadlinesFor } from "@/server/repos/announcements";
import { gradesOf } from "@/server/repos/grades";
import { readerOf } from "@/server/repos/profile";
import { activeRequests, type RequestRow } from "@/server/repos/requests";
import { lessonsBetween, type LessonRow } from "@/server/repos/schedule";
import { dismissedOffers, takenTypeCodes } from "@/server/repos/offers";
import { roomUsage } from "@/server/repos/rooms";
import { summarizeStudy, type StudySummary } from "./academics";
import { offerTypeCodes, offersFor, type Offer } from "./offer-rules";
import { anchorRoom, freeRoomsIn, nearestRooms, WINDOW_MIN_MINUTES, type NearOf } from "./schedule";

// Главная «Сейчас» (T05): всё, что важно студенту в эту минуту, одной функцией.
// Все запросы — параллельно и только через репозитории с ctx (S1).

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
  /** null — не загрузились: остальная лента всё равно показывается (ux-reviewer, T05) */
  announcements:
    | {
        id: string;
        title: string;
        body: string;
        publishedAt: Date;
        pinned: boolean;
        youSaid: boolean;
      }[]
    | null;
  /** Дедлайны не загрузились — «Скоро» показывает только экзамены и честно об этом говорит */
  deadlinesFailed: boolean;
  study: StudySummary | null;
  /** T14, «Вам положено»: что деканат предлагает студенту сам */
  offers: Offer[];
  /** T14: сейчас окно между парами — свободные аудитории до начала следующей (null — не окно) */
  freeNow: {
    until: Date;
    building: string;
    nearRoom: string;
    nearOf: NearOf;
    free: string[];
    known: number;
    near: string[];
  } | null;
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

/** «Готова — заберите» первой, дальше — по последнему изменению. Срок — в рабочих днях. */
export function sortRequests(rows: RequestRow[]): FeedRequest[] {
  const rank = (s: RequestStatus) => (s === "READY" ? 0 : 1);
  return rows
    .map((r) => ({ ...r, dueAt: addBusinessDays(r.createdAt, r.type.slaDays) }))
    .sort((a, b) => rank(a.status) - rank(b.status) || +b.updatedAt - +a.updatedAt);
}

export async function getNowFeed(ctx: StudentCtx, now: Date = new Date()): Promise<NowFeed | null> {
  const today = mskStartOfDay(now);
  // Главное (пара, заявки, оценки) — обязательно; объявления и дедлайны — по возможности:
  // их сбой не должен прятать ближайшую пару.
  const [[reader, lessons, requests, grades], [annResult, ddlResult]] = await Promise.all([
    Promise.all([
      readerOf(ctx),
      lessonsBetween(ctx, today, addDays(today, LOOKAHEAD_DAYS)),
      activeRequests(ctx),
      gradesOf(ctx),
    ]),
    Promise.allSettled([announcementsFor(ctx, now), deadlinesFor(ctx, now)]),
  ]);
  if (!reader) return null;
  const announcements = annResult.status === "fulfilled" ? annResult.value : null;
  const deadlines = ddlResult.status === "fulfilled" ? ddlResult.value : [];

  const exams: SoonItem[] = grades
    .filter((g) => g.examDate && g.examDate >= now)
    .map((g) => ({
      id: `exam-${g.discipline.id}-${g.semester}`,
      kind: "exam",
      title: g.discipline.name,
      at: g.examDate!,
    }));
  const dues: SoonItem[] = deadlines.map((d) => ({
    id: d.id,
    kind: "deadline",
    title: d.title,
    at: d.dueAt,
  }));
  const soon = [...exams, ...dues].sort((a, b) => +a.at - +b.at).slice(0, SOON_LIMIT);

  const study = summarizeStudy(grades);
  // «Вам положено» — по возможности, как объявления: сбой не должен прятать пару и заявки
  const offers = study
    ? await Promise.all([
        takenTypeCodes(ctx, offerTypeCodes()),
        dismissedOffers(ctx, study.semester),
      ])
        .then(([taken, dismissed]) => offersFor(study, taken, dismissed))
        .catch(() => [])
    : [];

  const freeNow = await freeRoomsNow(ctx, lessons, now).catch(() => null);

  const pinned = announcements?.filter((a) => a.pinned) ?? [];
  const latest = announcements?.find((a) => !a.pinned);
  const shownAnnouncements = announcements ? [...pinned, ...(latest ? [latest] : [])] : null;

  return {
    firstName: reader.firstName,
    next: pickNext(lessons, now),
    changes: pickChanges(lessons, now),
    soon,
    requests: sortRequests(requests),
    announcements: shownAnnouncements,
    deadlinesFailed: ddlResult.status === "rejected",
    study,
    offers,
    freeNow,
  };
}

/**
 * Окно прямо сейчас (T14): сегодня уже была пара, а до следующей — не меньше часа. Свободные аудитории —
 * в корпусе следующей пары, по расписанию недели (только номера, repos/rooms.ts).
 */
async function freeRoomsNow(ctx: StudentCtx, lessons: LessonRow[], now: Date) {
  const today = mskStartOfDay(now);
  const live = lessons
    .filter((l) => l.change !== "CANCELLED" && +mskStartOfDay(l.startsAt) === +today)
    .sort((a, b) => +a.startsAt - +b.startsAt);
  const prev = [...live].reverse().find((l) => +l.endsAt <= +now);
  const next = live.find((l) => +l.startsAt > +now);
  if (!prev || !next || +next.startsAt - +now < WINDOW_MIN_MINUTES * 60_000) return null;
  const weekStart = mskStartOfWeek(now);
  const usage = await roomUsage(ctx, next.building, weekStart, addDays(weekStart, 7));
  const free = freeRoomsIn(usage, now, next.startsAt);
  const anchor = anchorRoom(prev.room, next.room);
  return {
    until: next.startsAt,
    building: next.building,
    ...anchor,
    free,
    known: new Set(usage.map((u) => u.room)).size,
    near: nearestRooms(free, anchor.nearRoom),
  };
}
