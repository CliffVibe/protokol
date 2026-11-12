import "server-only";
import type { RequestStatus } from "@/generated/prisma/client";
import { addBusinessDays, addDays, mskStartOfDay } from "@/lib/msk";
import { isDebt } from "@/lib/scholarship";
import type { StudentCtx } from "@/server/auth/guards";
import { announcementsFor, deadlinesFor } from "@/server/repos/announcements";
import { gradesOf } from "@/server/repos/grades";
import { readerOf } from "@/server/repos/profile";
import { activeRequests, type RequestRow } from "@/server/repos/requests";
import { lessonsBetween, type LessonRow } from "@/server/repos/schedule";
import { dismissedOffers, takenTypeCodes } from "@/server/repos/offers";
import { summarizeStudy, type StudySummary } from "./academics";
import { deadlineRelevant, offerTypeCodes, offersFor, semesterOf, type Offer } from "./offer-rules";

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
  /** Сколько объявлений всего (на «Сейчас» — не больше двух, остальное по ссылке) */
  announcementsTotal: number;
  /** Дедлайны не загрузились — «Скоро» показывает только экзамены и честно об этом говорит */
  deadlinesFailed: boolean;
  study: StudySummary | null;
  /** T14, «Вам положено»: что деканат предлагает студенту сам */
  offers: Offer[];
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
      // Будущая дата у оценки с долгом — это пересдача (сид: Тимур, T14)
      title: isDebt(g) ? `Пересдача: ${g.discipline.name}` : g.discipline.name,
      at: g.examDate!,
    }));
  const study = summarizeStudy(grades, now);
  const subject = { study, course: reader.course };
  const dues: SoonItem[] = deadlines
    .filter((d) => deadlineRelevant(d.link, subject))
    .map((d) => ({
      id: d.id,
      kind: "deadline",
      title: d.title,
      at: d.dueAt,
    }));
  const soon = [...exams, ...dues].sort((a, b) => +a.at - +b.at).slice(0, SOON_LIMIT);

  // «Вам положено» — по возможности, как объявления: сбой не должен прятать пару и заявки
  // Семестр — по оценкам, а у первокурсника без оценок — по курсу и месяцу (для «Не сейчас»)
  const semester = semesterOf(subject, now);
  const offers =
    semester !== null
      ? await Promise.all([takenTypeCodes(ctx, offerTypeCodes()), dismissedOffers(ctx, semester)])
          .then(([taken, dismissed]) => offersFor(subject, taken, dismissed))
          .catch(() => [])
      : [];

  // Не больше двух: свежее закреплённое и свежее обычное — остальное по ссылке «Все объявления (N)».
  // Раньше шли все закреплённые, и «Сейчас» на 360 вытягивался почти в четыре экрана (оценка «глазами жюри»)
  const pinned = announcements?.find((a) => a.pinned);
  const latest = announcements?.find((a) => !a.pinned);
  const shownAnnouncements = announcements
    ? [pinned, latest].filter((a): a is NonNullable<typeof a> => a !== undefined)
    : null;

  const next = pickNext(lessons, now);
  return {
    firstName: reader.firstName,
    next,
    // Перенос ближайшей пары уже виден в её карточке — второй раз в «Изменениях» не повторяем (T14)
    changes: pickChanges(lessons, now).filter((l) => l.id !== next?.lesson.id),
    soon,
    requests: sortRequests(requests),
    announcements: shownAnnouncements,
    announcementsTotal: announcements?.length ?? 0,
    deadlinesFailed: ddlResult.status === "rejected",
    study,
    offers,
  };
}
