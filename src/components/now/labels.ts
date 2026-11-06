// Подписи статусов главной «Сейчас»: текст + тон + иконка — цвет никогда не единственный носитель смысла.
import type { ChangeKind, LessonKind, RequestStatus } from "@/generated/prisma/client";
import type { StatusTone } from "@/components/status-chip";

export const LESSON_KIND: Record<LessonKind, string> = {
  LECTURE: "Лекция",
  SEMINAR: "Семинар",
  LANGUAGE: "Иностранный язык",
  EXAM: "Экзамен",
  CONSULTATION: "Консультация",
};

export const CHANGE: Record<Exclude<ChangeKind, "NONE">, { label: string; tone: StatusTone }> = {
  MOVED: { label: "Перенос", tone: "warn" },
  CANCELLED: { label: "Отмена", tone: "danger" },
  ROOM_CHANGED: { label: "Другая аудитория", tone: "warn" },
  TEACHER_CHANGED: { label: "Замена преподавателя", tone: "warn" },
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
