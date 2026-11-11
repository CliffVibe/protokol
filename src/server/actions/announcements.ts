"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";
import { plural } from "@/lib/dates";
import { requireStaff } from "@/server/auth/guards";
import {
  publishAnnouncement,
  setPinned,
  staffAudienceOptions,
} from "@/server/repos/staff-announcements";
import {
  announcementFormSchema,
  buildAudience,
  readAnnouncementForm,
} from "@/server/services/staff-rules";

// Объявления сотрудника (T09). Первой инструкцией — requireStaff() (guards.test.ts).
// Кому — только свои факультеты: buildAudience отбрасывает чужое, репозиторий ещё раз фильтрует по facultyIds.

export type PublishState = {
  ok?: boolean;
  /** Сообщение об успехе: «Опубликовано: получили 3 студента» */
  message?: string;
  error?: string;
  fieldErrors?: { title?: string; body?: string; audience?: string };
  /** Что ввёл сотрудник — чтобы после ошибки форма не опустела */
  values?: {
    title: string;
    body: string;
    faculties: string[];
    courses: string[];
    groups: string[];
    pinned: boolean;
    youSaid: boolean;
  };
};

const text = (v: unknown) => (typeof v === "string" ? v.slice(0, 5000) : "");

export async function publishAnnouncementAction(
  _prev: PublishState,
  formData: FormData,
): Promise<PublishState> {
  const ctx = await requireStaff();
  const raw = readAnnouncementForm(formData);
  const values = {
    title: text(raw.title),
    body: text(raw.body),
    faculties: raw.faculties.slice(0, 20),
    courses: raw.courses.slice(0, 6),
    groups: raw.groups.slice(0, 100),
    pinned: raw.pinned,
    youSaid: raw.youSaid,
  };
  const parsed = announcementFormSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: NonNullable<PublishState["fieldErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === "title" || key === "body") fieldErrors[key] ??= issue.message;
      else fieldErrors.audience ??= "Проверьте, кому адресовано объявление";
    }
    return { fieldErrors, values };
  }
  const audience = buildAudience(parsed.data, await staffAudienceOptions(ctx));
  if (!audience.ok) return { fieldErrors: { audience: audience.error }, values };

  const result = await publishAnnouncement(ctx, {
    title: parsed.data.title,
    body: parsed.data.body,
    audience: audience.audience,
    pinned: parsed.data.pinned,
    youSaid: parsed.data.youSaid,
  });
  if (!result.ok)
    return {
      fieldErrors: { audience: "Под эти условия не попал ни один студент — расширьте адресатов" },
      values,
    };

  revalidatePath("/staff/announcements");
  revalidatePath("/", "layout");
  const n = result.recipients;
  return {
    ok: true,
    message: `Опубликовано: получили ${n} ${plural(n, ["студент", "студента", "студентов"])}`,
  };
}

const pinSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9-]{1,80}$/),
  pinned: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export async function togglePinAction(formData: FormData): Promise<void> {
  const ctx = await requireStaff();
  const parsed = pinSchema.safeParse({ id: formData.get("id"), pinned: formData.get("pinned") });
  if (!parsed.success) notFound();
  if (!(await setPinned(ctx, parsed.data.id, parsed.data.pinned))) notFound();
  revalidatePath("/staff/announcements");
  revalidatePath("/", "layout");
}
