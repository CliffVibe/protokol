"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { formatTime, plural } from "@/lib/dates";
import { requireStaff } from "@/server/auth/guards";
import { rescheduleLesson } from "@/server/repos/staff-schedule";
import { suggestRooms } from "@/server/services/schedule";
import {
  clashMessage,
  newStartsAt,
  readRescheduleForm,
  rescheduleFormSchema,
} from "@/server/services/staff-rules";

// Перенос пары сотрудником (T09). Первой инструкцией — requireStaff() (guards.test.ts).
// Пара своего факультета, «время всё ещё то, что видел сотрудник» — проверяет репозиторий, а не скрытая кнопка.

export type RescheduleState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: { date?: string; time?: string; room?: string; reason?: string };
  /**
   * Аудитория занята — свободные в корпусе в новое время (T14+): сотрудник выбирает одним касанием.
   * `label` — «Свободны с 12:40 до 14:00:»: время в подписи, а не «в это время» — после правки «Начала»
   * подсказка остаётся от прежнего (ux-reviewer, T14+)
   */
  freeRooms?: { rooms: string[]; label: string };
  /** Что ввёл сотрудник: React сбрасывает форму после действия — при ошибке возвращаем значения */
  values?: { date: string; time: string; room: string; reason: string };
};

const MAX_VALUE = 300;

export async function rescheduleLessonAction(
  _prev: RescheduleState,
  formData: FormData,
): Promise<RescheduleState> {
  const ctx = await requireStaff();
  const raw = readRescheduleForm(formData);
  const text = (v: unknown) => (typeof v === "string" ? v.slice(0, MAX_VALUE) : "");
  const values = {
    date: text(raw.date),
    time: text(raw.time),
    room: text(raw.room),
    reason: text(raw.reason),
  };
  const parsed = rescheduleFormSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: NonNullable<RescheduleState["fieldErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === "date" || key === "time" || key === "room" || key === "reason")
        fieldErrors[key] ??= issue.message;
      else return { error: "Не получилось — обновите страницу" };
    }
    return { fieldErrors, values };
  }
  const now = new Date();
  const at = newStartsAt(parsed.data, now);
  if (!at.ok) return { fieldErrors: { date: at.error }, values };

  const r = await rescheduleLesson(
    ctx,
    {
      lessonId: parsed.data.lessonId,
      expectedStartsAt: parsed.data.expectedStartsAt,
      startsAt: at.at,
      room: parsed.data.room,
      reason: parsed.data.reason,
    },
    now,
  );
  if (r.result === "busy") {
    const c = r.clash;
    if (c.kind !== "room") {
      const { field, message } = clashMessage(c);
      return { fieldErrors: { [field]: message }, values };
    }
    // Подсказка аудиторий — по возможности: её сбой (null) не должен ни прятать причину отказа,
    // ни выдавать себя за «свободных нет» (ux-reviewer, T14+)
    const rooms = await suggestRooms(ctx, { ...c, lessonId: parsed.data.lessonId }).catch(
      () => null,
    );
    const { field, message } = clashMessage(c, rooms?.length ?? null);
    return {
      fieldErrors: { [field]: message },
      freeRooms: rooms?.length
        ? { rooms, label: `Свободны с ${formatTime(c.startsAt)} до ${formatTime(c.endsAt)}:` }
        : undefined,
      values,
    };
  }
  if (r.result !== "ok") {
    if (r.result === "not_found") notFound();
    // Введённое возвращаем и здесь: React сбросил форму, причина не должна пропасть (ux-reviewer, T14+)
    if (r.result === "cancelled") return { error: "Пара отменена — перенести её нельзя", values };
    return {
      error: "Пару уже изменили — обновите страницу, чтобы увидеть актуальное время",
      values,
    };
  }

  revalidatePath("/staff/schedule");
  revalidatePath("/", "layout");
  const n = r.recipients;
  return {
    ok: true,
    message: `Пара перенесена, уведомление получили ${n} ${plural(n, ["студент", "студента", "студентов"])}`,
  };
}
