"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { plural } from "@/lib/dates";
import { requireStaff } from "@/server/auth/guards";
import { rescheduleLesson } from "@/server/repos/staff-schedule";
import {
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
};

export async function rescheduleLessonAction(
  _prev: RescheduleState,
  formData: FormData,
): Promise<RescheduleState> {
  const ctx = await requireStaff();
  const parsed = rescheduleFormSchema.safeParse(readRescheduleForm(formData));
  if (!parsed.success) {
    const fieldErrors: NonNullable<RescheduleState["fieldErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === "date" || key === "time" || key === "room" || key === "reason")
        fieldErrors[key] ??= issue.message;
      else return { error: "Не получилось — обновите страницу" };
    }
    return { fieldErrors };
  }
  const now = new Date();
  const at = newStartsAt(parsed.data, now);
  if (!at.ok) return { fieldErrors: { date: at.error } };

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
  if (r.result !== "ok") {
    if (r.result === "not_found") notFound();
    if (r.result === "cancelled") return { error: "Пара отменена — перенести её нельзя" };
    return { error: "Пару уже изменили — обновите страницу, чтобы увидеть актуальное время" };
  }

  revalidatePath("/staff/schedule");
  revalidatePath("/", "layout");
  const n = r.recipients;
  return {
    ok: true,
    message: `Пара перенесена, уведомление получили ${n} ${plural(n, ["студент", "студента", "студентов"])}`,
  };
}
