import "server-only";
import { ASSESSMENT_KIND } from "@/components/grades/labels";
import { CHANGE, LESSON_KIND, REQUEST_STATUS } from "@/components/now/labels";
import { formatDayMonth, formatRelativeDay, formatTime } from "@/lib/dates";
import { addDays, mskStartOfDay } from "@/lib/msk";
import type { StudentCtx } from "@/server/auth/guards";
import { gradesOf } from "@/server/repos/grades";
import { readerOf } from "@/server/repos/profile";
import { activeRequests } from "@/server/repos/requests";
import { lessonsBetween, type LessonRow } from "@/server/repos/schedule";
import {
  sessionSummary,
  summarizeStudy,
  type GradeRow,
  type SessionSummary,
  type StudySummary,
} from "@/server/services/academics";
import { sortRequests, type FeedRequest } from "@/server/services/now";

// Контекст помощника (T12, S8): ТОЛЬКО текущий студент — из ctx сессии, через те же репозитории,
// что и его экраны (фильтр studentId / groupIds внутри них). Ничего не берём из вопроса или истории.
// Без номера зачётки, id и токенов: модели они не нужны, а промпт уходит во внешний сервис.

export const CONTEXT_DAYS = 7;

export type StudentContext = {
  now: Date;
  firstName: string;
  groupName: string;
  course: number;
  facultyCode: string;
  lessons: LessonRow[];
  study: StudySummary | null;
  session: SessionSummary | null;
  current: GradeRow[];
  requests: FeedRequest[];
};

export async function buildStudentContext(
  ctx: StudentCtx,
  now: Date = new Date(),
): Promise<StudentContext | null> {
  const today = mskStartOfDay(now);
  const [reader, lessons, grades, requests] = await Promise.all([
    readerOf(ctx),
    lessonsBetween(ctx, today, addDays(today, CONTEXT_DAYS)),
    gradesOf(ctx),
    activeRequests(ctx),
  ]);
  if (!reader) return null;
  const study = summarizeStudy(grades);
  const current = study ? grades.filter((g) => g.semester === study.semester) : [];
  return {
    now,
    ...reader,
    // Прошедшие сегодня пары модели не нужны: «следующая пара» — только впереди
    lessons: lessons.filter((l) => l.endsAt > now),
    study,
    session: sessionSummary(current, now),
    current,
    requests: sortRequests(requests),
  };
}

export function lessonLine(l: LessonRow, now: Date): string {
  const when = `${formatRelativeDay(l.startsAt, now)} ${formatTime(l.startsAt)}–${formatTime(l.endsAt)}`;
  const what = `${l.discipline.name} (${LESSON_KIND[l.kind].toLowerCase()})`;
  const where = `${l.building}, ауд. ${l.room}`;
  const change =
    l.change === "NONE"
      ? ""
      : l.change === "MOVED" && l.originalStartsAt
        ? `; перенос, было ${formatRelativeDay(l.originalStartsAt, now)} ${formatTime(l.originalStartsAt)}`
        : `; ${CHANGE[l.change].label.toLowerCase()}`;
  return `${when} — ${what}, ${where}, преподаватель ${l.teacher.fullName}${change}`;
}

function gradeLine(g: GradeRow): string {
  const parts = [`${g.discipline.name} — ${ASSESSMENT_KIND[g.kind].toLowerCase()}`];
  if (g.ratingPoints !== null) parts.push(`рейтинг ${g.ratingPoints} из 100`);
  if (g.examDate) parts.push(`дата контроля ${formatDayMonth(g.examDate)}`);
  if (g.finalMark !== null) parts.push(`итог ${g.finalMark}`);
  else if (g.passed !== null) parts.push(g.passed ? "зачтено" : "не зачтено");
  else parts.push("итога пока нет");
  return parts.join(", ");
}

export function requestLine(r: FeedRequest): string {
  return `${r.number} «${r.type.title}» — ${REQUEST_STATUS[r.status].label.toLowerCase()}, ожидаемый срок ${formatDayMonth(r.dueAt)}`;
}

/** Блок ДАННЫЕ для системного промпта: компактный текст, только про этого студента. */
export function contextToText(c: StudentContext): string {
  const lines: string[] = [
    `Сейчас: ${formatRelativeDay(c.now, c.now)}, ${formatDayMonth(c.now)}, ${formatTime(c.now)} по Москве.`,
    `Собеседник: ${c.firstName}, группа ${c.groupName}, ${c.course} курс, факультет ${c.facultyCode}.`,
    "",
    `Пары на ${CONTEXT_DAYS} дней:`,
    ...(c.lessons.length ? c.lessons.map((l) => `- ${lessonLine(l, c.now)}`) : ["- пар нет"]),
    "",
  ];
  if (c.study) {
    const s = c.study;
    lines.push(
      `Учёба, семестр ${s.semester}: средний рейтинг ${s.averageRating ?? "—"}; долгов за прошлые семестры: ${s.debts}.`,
      s.scholarship.kept
        ? "Стипендия на следующий семестр: сохраняется."
        : `Стипендия под угрозой: ${s.scholarship.reasons.join("; ")}.`,
      "Дисциплины текущего семестра:",
      ...c.current.map((g) => `- ${gradeLine(g)}`),
    );
    if (c.session?.next) {
      const n = c.session.next;
      lines.push(
        `Ближайший контроль: ${ASSESSMENT_KIND[n.kind].toLowerCase()} «${n.name}», ${formatDayMonth(n.at)}.`,
      );
    }
  } else {
    lines.push("Оценок пока нет.");
  }
  lines.push(
    "",
    "Активные заявки:",
    ...(c.requests.length ? c.requests.map((r) => `- ${requestLine(r)}`) : ["- нет"]),
  );
  return lines.join("\n");
}
