// Правила кабинета сотрудника для T09 — чистые функции без БД (tests/unit/staff-rules.test.ts):
// объявление (поля, адресаты только своих факультетов) и перенос пары (дата, время, причина, текст уведомления).
import { z } from "zod";
import type { Audience } from "@/lib/audience";
import { formatRelativeDay, formatTime, plural } from "@/lib/dates";
import { assertLink } from "@/lib/links";
import { markdownToPlain } from "@/lib/markdown";
import { addDays, mskAt, mskDateKey, mskDayFromKey, mskStartOfDay } from "@/lib/msk";

// ── Объявление ──

export const ANNOUNCEMENT_TITLE_MAX = 120;
export const ANNOUNCEMENT_BODY_MAX = 4000;
/** Тело уведомления — коротко: полный текст на доске объявлений. */
const NOTIFICATION_BODY_MAX = 200;

const shortCode = z.string().min(1).max(20);

export const announcementFormSchema = z.object({
  title: z
    .string({ error: "Напишите заголовок" })
    .trim()
    .min(3, "Заголовок — хотя бы 3 символа")
    .max(ANNOUNCEMENT_TITLE_MAX, `Не длиннее ${ANNOUNCEMENT_TITLE_MAX} символов`),
  body: z
    .string({ error: "Напишите текст объявления" })
    .trim()
    .min(1, "Напишите текст объявления")
    .max(ANNOUNCEMENT_BODY_MAX, `Не длиннее ${ANNOUNCEMENT_BODY_MAX} символов`),
  faculties: z.array(shortCode).max(20),
  courses: z.array(z.coerce.number().int().min(1).max(6)).max(6),
  groups: z.array(shortCode).max(100),
  pinned: z.boolean(),
  /** T14: ответ на отзывы студентов — пометка «Вы сказали — мы сделали» */
  youSaid: z.boolean().default(false),
});
export type AnnouncementForm = z.infer<typeof announcementFormSchema>;

/** Поля формы → объект для схемы (чекбоксы — повторяющиеся имена). */
export function readAnnouncementForm(fd: FormData) {
  const all = (name: string) => fd.getAll(name).filter((v): v is string => typeof v === "string");
  return {
    title: fd.get("title") ?? undefined,
    body: fd.get("body") ?? undefined,
    faculties: all("faculty"),
    courses: all("course"),
    groups: all("group"),
    pinned: fd.get("pinned") === "on",
    youSaid: fd.get("youSaid") === "on",
  };
}

export type AudienceOptions = {
  faculties: { code: string }[];
  groups: { name: string; course: number; facultyCode: string }[];
};

export type AudienceResult = { ok: true; audience: Audience } | { ok: false; error: string };

/**
 * Кому объявление. Сотрудник пишет только студентам своих факультетов (S1): чужой факультет и чужая
 * группа из формы отбрасываются, а «ничего не выбрано» = все свои факультеты — не «всем» (`{}`).
 * Группа, которая не подходит под выбранные факультет и курс, — ошибка: иначе объявление ушло бы в пустоту.
 */
export function buildAudience(form: AnnouncementForm, options: AudienceOptions): AudienceResult {
  const own = options.faculties.map((f) => f.code);
  const picked = [...new Set(form.faculties)].filter((c) => own.includes(c));
  const facultyCodes = picked.length ? picked : own;
  if (!facultyCodes.length) return { ok: false, error: "У вас нет факультетов для объявлений" };

  const courses = [...new Set(form.courses)].sort((a, b) => a - b);
  const known = new Map(options.groups.map((g) => [g.name, g]));
  const groupNames = [...new Set(form.groups)].filter((n) => known.has(n));
  const misfit = groupNames.filter((n) => {
    const g = known.get(n)!;
    return (
      !facultyCodes.includes(g.facultyCode) || (courses.length > 0 && !courses.includes(g.course))
    );
  });
  if (misfit.length)
    return {
      ok: false,
      error: `Группа ${misfit.join(", ")} не входит в выбранные факультеты или курсы`,
    };

  return {
    ok: true,
    audience: {
      facultyCodes,
      ...(courses.length ? { courses } : {}),
      ...(groupNames.length ? { groupNames } : {}),
    },
  };
}

/** «ФМО и МЭО, 2 и 3 курс, группы 2МО-3» — без разделителя «·» (04-design). */
export function describeAudience(raw: Audience): string {
  const list = (xs: (string | number)[]) =>
    xs.length > 1 ? `${xs.slice(0, -1).join(", ")} и ${xs.at(-1)}` : String(xs[0] ?? "");
  const parts: string[] = [];
  // «все факультеты» — только когда нет и групп: «все факультеты, группа 2МО-3» сбивает (ux-reviewer T09)
  if (raw.facultyCodes?.length) parts.push(list(raw.facultyCodes));
  else if (!raw.groupNames?.length) parts.push("все факультеты");
  if (raw.courses?.length) parts.push(`${list(raw.courses)} курс`);
  if (raw.groupNames?.length)
    parts.push(`${raw.groupNames.length > 1 ? "группы" : "группа"} ${list(raw.groupNames)}`);
  return parts.join(", ");
}

/** Где объявление на доске студента. */
export const announcementHref = (id: string) =>
  assertLink(`/notifications?tab=announcements#announcement-${encodeURIComponent(id)}`);

export function announcementNotification(a: { id: string; title: string; body: string }) {
  return {
    kind: "ANNOUNCEMENT" as const,
    title: a.title,
    body: markdownToPlain(a.body, NOTIFICATION_BODY_MAX),
    link: announcementHref(a.id),
  };
}

// ── Перенос пары ──

/** Насколько вперёд можно перенести: дальше расписание пересобирает сид, и это уже не «перенос». */
export const RESCHEDULE_DAYS_AHEAD = 30;
const EARLIEST = "08:00";
const LATEST = "21:00";

export const lessonIdSchema = z.string().regex(/^[A-Za-z0-9-]{1,80}$/);

export const rescheduleFormSchema = z.object({
  lessonId: lessonIdSchema,
  /** startsAt, который видел сотрудник: если пару уже перенесли — конфликт, а не тихая перезапись */
  expectedStartsAt: z.iso.datetime().transform((s) => new Date(s)),
  date: z
    .string({ error: "Выберите дату" })
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Выберите дату")
    .transform((s) => mskDayFromKey(s))
    .refine((d): d is Date => d !== null, "Такой даты нет"),
  time: z
    .string({ error: "Укажите время" })
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Время — в формате 10:10")
    .refine((t) => t >= EARLIEST && t <= LATEST, `Пары идут с ${EARLIEST} до ${LATEST}`),
  room: z
    .string()
    .trim()
    .max(20, "Не длиннее 20 символов")
    .transform((s) => (s === "" ? null : s)),
  reason: z
    .string({ error: "Напишите причину" })
    .trim()
    .min(5, "Напишите причину — студенты увидят её в уведомлении")
    .max(200, "Не длиннее 200 символов"),
});
export type RescheduleForm = z.infer<typeof rescheduleFormSchema>;

export function readRescheduleForm(fd: FormData) {
  const get = (name: string) => fd.get(name) ?? undefined;
  return {
    lessonId: get("lessonId"),
    expectedStartsAt: get("expectedStartsAt"),
    date: get("date"),
    time: get("time"),
    room: get("room") ?? "",
    reason: get("reason"),
  };
}

/** Новое начало пары или ошибка для поля «дата». Прошлое и дальше 30 дней — нельзя. */
export function newStartsAt(
  form: Pick<RescheduleForm, "date" | "time">,
  now: Date,
): { ok: true; at: Date } | { ok: false; error: string } {
  const at = mskAt(form.date, form.time);
  if (at <= now) return { ok: false, error: "Это время уже прошло — выберите позже" };
  if (form.date > addDays(mskStartOfDay(now), RESCHEDULE_DAYS_AHEAD))
    return { ok: false, error: `Перенести можно не дальше чем на ${RESCHEDULE_DAYS_AHEAD} дней` };
  return { ok: true, at };
}

/**
 * Почему в новое время нельзя (T14+): у группы уже пара; у части её студентов — языковая пара
 * (языковые группы смешаны по факультетам — наружу только время и сколько студентов); преподаватель
 * занят; аудитория занята. Чужие группы и людей не называем — только время и номер аудитории.
 */
export type RescheduleClash =
  | { kind: "group"; discipline: string; startsAt: Date; endsAt: Date }
  | { kind: "language"; students: number; startsAt: Date; endsAt: Date }
  | { kind: "teacher"; startsAt: Date; endsAt: Date }
  | { kind: "room"; building: string; room: string; startsAt: Date; endsAt: Date };

const span = (c: { startsAt: Date; endsAt: Date }) =>
  `${formatTime(c.startsAt)}–${formatTime(c.endsAt)}`;

/**
 * Накладка → ошибка у поля, которое её исправит: время (группа, языковая, преподаватель) или аудитория.
 * Для аудитории `freeRooms` — сколько свободных подсказали: 0 — менять надо время, а не номер (ошибка у
 * «Начала», ux-reviewer T14+); есть — «выберите ниже»; null — подсказка не загрузилась.
 */
export function clashMessage(
  c: RescheduleClash,
  freeRooms: number | null = null,
): { field: "time" | "room"; message: string } {
  switch (c.kind) {
    case "group":
      return {
        field: "time",
        message: `У группы в это время уже пара: ${c.discipline}, ${span(c)}. Выберите другое время`,
      };
    case "language": {
      // «у 1 / 21 студента», «у 2 / 5 студентов» — родительный падеж
      const who =
        c.students === 1
          ? "одного студента"
          : `${c.students} ${plural(c.students, ["студента", "студентов", "студентов"])}`;
      return {
        field: "time",
        message: `У ${who} группы в это время языковая пара (${span(c)}). Выберите другое время`,
      };
    }
    case "teacher":
      return {
        field: "time",
        message: `У преподавателя в это время другая пара (${span(c)}). Выберите другое время`,
      };
    case "room": {
      const busy = `Ауд. ${c.room} в это время занята`;
      if (freeRooms === 0)
        return {
          field: "time",
          message: `${busy}, а свободных в корпусе по расписанию нет. Выберите другое время`,
        };
      return {
        field: "room",
        message: freeRooms
          ? `${busy}. Выберите свободную ниже или впишите другую`
          : `${busy}. Укажите другую`,
      };
    }
  }
}

/** Ссылка на день в расписании студента. */
export const scheduleDayHref = (d: Date) => assertLink(`/schedule?day=${mskDateKey(d)}`);

/** Уведомление группе: «завтра, 10:10 → пн, 9 нояб., 17:40, Главный корпус, ауд. 305. Причина: …». */
export function rescheduleNotification(
  l: { discipline: string; from: Date; to: Date; building: string; room: string; reason: string },
  now: Date,
) {
  const when = (d: Date) => `${formatRelativeDay(d, now)}, ${formatTime(d)}`;
  return {
    kind: "SCHEDULE_CHANGE" as const,
    title: `Перенос пары: ${l.discipline}`,
    body: `${when(l.from)} → ${when(l.to)}, ${l.building}, ауд. ${l.room}. Причина: ${l.reason}`,
    link: scheduleDayHref(l.to),
  };
}
