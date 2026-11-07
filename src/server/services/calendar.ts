import "server-only";
import { CHANGE, LESSON_KIND } from "@/components/now/labels";
import { formatDayMonth, formatTime } from "@/lib/dates";
import { buildCalendar, type IcsEvent } from "@/lib/ics";
import { addDays, mskStartOfDay } from "@/lib/msk";
import { lessonsByCalendarToken, type CalendarLesson } from "@/server/repos/calendar";

// Подписка .ics (T11, S7): только пары — время, дисциплина, вид, аудитория, преподаватель, изменение.
// Ничего о студенте. Окно — две недели назад (видно недавнее) и три месяца вперёд.
const PAST_DAYS = 14;
const FUTURE_DAYS = 90;
const REFRESH_HOURS = 6;

export function lessonEvent(l: CalendarLesson): IcsEvent {
  const kind = LESSON_KIND[l.kind].toLowerCase();
  const cancelled = l.change === "CANCELLED";
  const details = [`Преподаватель: ${l.teacher.fullName}`];
  if (l.change !== "NONE") {
    const was =
      l.change === "MOVED" && l.originalStartsAt
        ? ` (было ${formatDayMonth(l.originalStartsAt)}, ${formatTime(l.originalStartsAt)})`
        : "";
    details.push(`${CHANGE[l.change].label}${was}${l.changeNote ? `: ${l.changeNote}` : ""}`);
  }
  return {
    uid: `${l.id}@protokol`,
    start: l.startsAt,
    end: l.endsAt,
    summary: `${cancelled ? "Отменена: " : ""}${l.discipline.name} — ${kind}`,
    location: `ауд. ${l.room}, ${l.building}`,
    description: details.join("\n"),
    cancelled,
  };
}

/** Текст .ics по токену или null — токена нет (перевыпущен или не существовал). */
export async function calendarFeed(token: string, now: Date): Promise<string | null> {
  const today = mskStartOfDay(now);
  const lessons = await lessonsByCalendarToken(
    token,
    addDays(today, -PAST_DAYS),
    addDays(today, FUTURE_DAYS),
  );
  if (!lessons) return null;
  return buildCalendar({
    name: "Протокол — расписание",
    refreshHours: REFRESH_HOURS,
    events: lessons.map(lessonEvent),
    now,
  });
}
