// Пара для экрана расписания: готовые строки по Москве. Объект простой и сериализуемый —
// тот же уходит в клиентский лист с деталями, и время там не пересчитывается в поясе браузера.
import { formatLongDay, formatTime, formatWas } from "@/lib/dates";
import { mskDateKey } from "@/lib/msk";
import type { LessonRow } from "@/server/repos/schedule";
import type { StatusTone } from "@/components/status-chip";
import { CHANGE, LESSON_KIND, type LessonChange } from "@/components/now/labels";

export type LessonView = {
  id: string;
  title: string;
  /** «Лекция», «Семинар», «Иностранный язык» */
  kind: string;
  /** Название языковой группы — бейдж языка; null у пар основной группы */
  language: string | null;
  start: string;
  end: string;
  /** «Четверг, 12 ноября» */
  day: string;
  room: string;
  building: string;
  teacher: string;
  change: {
    kind: LessonChange;
    label: string;
    tone: StatusTone;
    /** «было 09:00» / «было вчера, 09:00» — только у переноса */
    was: string | null;
    /** Причина из деканата: «Преподаватель на конференции» */
    note: string | null;
  } | null;
  cancelled: boolean;
  ongoing: boolean;
  /**
   * Пара сегодня уже закончилась: экран отвечает «куда идти дальше» (ux-reviewer, T06).
   * Прошедшие дни недели не помечаем — там это шум, а не подсказка.
   */
  past: boolean;
  exam: boolean;
};

export function toLessonView(lesson: LessonRow, now: Date): LessonView {
  const change =
    lesson.change === "NONE"
      ? null
      : {
          kind: lesson.change,
          label: CHANGE[lesson.change].label,
          tone: CHANGE[lesson.change].tone,
          was:
            lesson.change === "MOVED" && lesson.originalStartsAt
              ? formatWas(lesson.originalStartsAt, lesson.startsAt, now)
              : null,
          note: lesson.changeNote,
        };
  const cancelled = lesson.change === "CANCELLED";
  return {
    id: lesson.id,
    title: lesson.discipline.name,
    kind: LESSON_KIND[lesson.kind],
    language: lesson.languageGroup?.name ?? null,
    start: formatTime(lesson.startsAt),
    end: formatTime(lesson.endsAt),
    day: formatLongDay(lesson.startsAt),
    room: lesson.room,
    building: lesson.building,
    teacher: lesson.teacher.fullName,
    change,
    cancelled,
    ongoing: !cancelled && lesson.startsAt <= now && now < lesson.endsAt,
    past: lesson.endsAt <= now && mskDateKey(lesson.startsAt) === mskDateKey(now),
    exam: lesson.kind === "EXAM",
  };
}
