// Подписи статусов «Сейчас» и расписания: текст + тон + иконка — цвет никогда не единственный носитель смысла.
import { CalendarClock, CircleX, DoorOpen, UserRoundCog, type LucideIcon } from "lucide-react";
import type { ChangeKind, LessonKind, RequestStatus } from "@/generated/prisma/client";
import type { StatusTone } from "@/components/status-chip";

export const LESSON_KIND: Record<LessonKind, string> = {
  LECTURE: "Лекция",
  SEMINAR: "Семинар",
  LANGUAGE: "Иностранный язык",
  EXAM: "Экзамен",
  CONSULTATION: "Консультация",
};

export type LessonChange = Exclude<ChangeKind, "NONE">;

// У каждого изменения своя иконка: три «жёлтых» различимы и без цвета, и без чтения (T06)
export const CHANGE: Record<LessonChange, { label: string; tone: StatusTone; icon: LucideIcon }> = {
  MOVED: { label: "Перенос", tone: "warn", icon: CalendarClock },
  CANCELLED: { label: "Отмена", tone: "danger", icon: CircleX },
  ROOM_CHANGED: { label: "Другая аудитория", tone: "warn", icon: DoorOpen },
  TEACHER_CHANGED: { label: "Замена преподавателя", tone: "warn", icon: UserRoundCog },
};

type ActiveStatus = Extract<RequestStatus, "SUBMITTED" | "ACCEPTED" | "IN_PROGRESS" | "READY">;

export const REQUEST_STATUS: Record<ActiveStatus, { label: string; tone: StatusTone }> = {
  SUBMITTED: { label: "Подана", tone: "neutral" },
  ACCEPTED: { label: "Принята", tone: "brand" },
  IN_PROGRESS: { label: "В работе", tone: "brand" },
  READY: { label: "Готова — заберите", tone: "ok" },
};

export function requestStatus(status: RequestStatus) {
  return REQUEST_STATUS[status as ActiveStatus] ?? { label: status, tone: "neutral" as const };
}
