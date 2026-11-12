// Правила заявок (T08) — чистые функции без БД, с юнит-тестами (tests/unit/request-rules.test.ts):
// описание полей типа и zod-схема заявки из него, номер, переходы статусов, шаги таймлайна,
// просрочка, тексты уведомлений, проверка ссылки уведомления.
import { z } from "zod";
import type { RequestStatus } from "@/generated/prisma/client";
import { addBusinessDays, addDays, mskDateKey, mskStartOfDay } from "@/lib/msk";
import { BATCH_TARGETS, REPLY_TEMPLATES, type ReplyTemplateId } from "@/lib/reply-templates";

// ── Поля типа заявки: RequestType.fields (JSON из БД — тоже ввод, проверяем) ──

const fieldName = z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,39}$/);
const fieldLabel = z.string().min(1).max(120);
/** Подсказка под полем («Например: Франция», T13) — через aria-describedby, необязательна. */
const fieldHint = z.string().min(1).max(120).optional();

export const fieldSpecSchema = z.discriminatedUnion("type", [
  z.object({
    name: fieldName,
    label: fieldLabel,
    hint: fieldHint,
    type: z.literal("text"),
    required: z.boolean(),
    maxLength: z.number().int().min(1).max(1000),
  }),
  z.object({
    name: fieldName,
    label: fieldLabel,
    hint: fieldHint,
    type: z.literal("select"),
    required: z.boolean(),
    options: z.array(z.string().min(1).max(80)).min(1).max(20),
  }),
]);
export type FieldSpec = z.infer<typeof fieldSpecSchema>;

/** Описание полей или null — описание битое, тип заказать нельзя (не падаем и не принимаем что попало). */
export function parseFields(json: unknown): FieldSpec[] | null {
  const parsed = z.array(fieldSpecSchema).max(10).safeParse(json);
  if (!parsed.success) return null;
  const names = parsed.data.map((f) => f.name);
  return new Set(names).size === names.length ? parsed.data : null;
}

export const LANGUAGE_LABEL: Record<string, string> = { ru: "Русский", en: "Английский" };

const REQUIRED = "Заполните поле";

/** Значение из формы: строка без краёв; пустая строка у необязательного поля — «нет значения». */
const trimmed = (v: unknown) => (typeof v === "string" ? v.trim() : v);
const emptyToUndefined = (v: unknown) => {
  const t = trimmed(v);
  return t === "" ? undefined : t;
};

function fieldSchema(f: FieldSpec): z.ZodType {
  const value =
    f.type === "text"
      ? z
          .string({ error: REQUIRED })
          .max(f.maxLength, `Не длиннее ${f.maxLength} символов`)
          .refine((v) => !f.required || v.length > 0, REQUIRED)
      : z.enum(f.options as [string, ...string[]], { error: "Выберите вариант" });
  return f.required
    ? z.preprocess(trimmed, value)
    : z.preprocess(emptyToUndefined, value.optional());
}

/**
 * zod-схема заявки по описанию полей и языкам типа. Строится на сервере: клиент получает только
 * описание для отрисовки. Лишние поля отбрасываются, пустые необязательные — не сохраняются.
 */
export function buildPayloadSchema(fields: FieldSpec[], languages: string[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of fields) shape[f.name] = fieldSchema(f);
  const [first, ...rest] = languages;
  const language = first
    ? z.preprocess(
        (v) => (v === undefined || v === null || v === "" ? first : v),
        z.enum([first, ...rest] as [string, ...string[]], { error: "Выберите язык справки" }),
      )
    : z.never();
  return z.object({ language, payload: z.object(shape) }).transform(({ language, payload }) => ({
    language,
    // Только заполненные поля — как Record<string, string>
    payload: Object.fromEntries(
      Object.entries(payload).filter((e): e is [string, string] => typeof e[1] === "string"),
    ),
  }));
}

// ── Номер заявки ──

/** «С-2026-00042» (С — кириллическая, как в сиде). */
export function formatRequestNumber(year: number, seq: number): string {
  return `С-${year}-${String(seq).padStart(5, "0")}`;
}

/**
 * Буква номера, какой её наберут руками: латинская C или строчная «с» — та же кириллическая «С»
 * (T14, оценка «глазами жюри»: номер с латинской C давал 404 на собственную заявку, и проверка изоляции
 * подстановкой номера выглядела бы так, будто 404 показывают всегда).
 */
export function normalizeRequestNumber(value: string): string {
  return value.replace(/^[СCсc](?=-)/u, "С");
}

/** Номер из адреса: только формат (чей — решает репозиторий, S1). */
export const requestNumberSchema = z.preprocess(
  (v) => (typeof v === "string" ? normalizeRequestNumber(v.trim()) : v),
  z.string().regex(/^С-\d{4}-\d{5,9}$/),
);

// ── Статусы ──

export const ALL_STATUSES = [
  "SUBMITTED",
  "ACCEPTED",
  "IN_PROGRESS",
  "READY",
  "ISSUED",
  "REJECTED",
  "CANCELLED",
] as const satisfies readonly RequestStatus[];
export const statusSchema = z.enum(ALL_STATUSES);

export const ACTIVE_STATUSES = ["SUBMITTED", "ACCEPTED", "IN_PROGRESS", "READY"] as const;
export const ARCHIVE_STATUSES = ["ISSUED", "REJECTED", "CANCELLED"] as const;
/** «В работе у деканата» — то, что ещё надо сделать (фильтр очереди по умолчанию). */
export const PENDING_STATUSES = ["SUBMITTED", "ACCEPTED", "IN_PROGRESS"] as const;

/** Разрешённые переходы сотрудника. Всё остальное — запрещено (и на сервере тоже). */
export const TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  SUBMITTED: ["ACCEPTED", "REJECTED"],
  ACCEPTED: ["IN_PROGRESS", "REJECTED"],
  IN_PROGRESS: ["READY", "REJECTED"],
  READY: ["ISSUED"],
  ISSUED: [],
  REJECTED: [],
  CANCELLED: [],
};

export const canTransition = (from: RequestStatus, to: RequestStatus) =>
  TRANSITIONS[from].includes(to);

export const rejectReasonSchema = z
  .string({ error: "Напишите причину" })
  .trim()
  .min(5, "Напишите причину — студент увидит её в заявке")
  .max(500, "Не длиннее 500 символов");

export const commentSchema = z
  .string()
  .trim()
  .max(500, "Не длиннее 500 символов")
  .transform((s) => (s === "" ? null : s));

// ── Оценка решения заявки (T14, «Вы сказали — мы сделали») ──

/** Оценивать можно, когда деканат сделал работу: справка готова или выдана. */
export const RATABLE_STATUSES = ["READY", "ISSUED"] as const satisfies readonly RequestStatus[];
export const isRatable = (status: RequestStatus) =>
  (RATABLE_STATUSES as readonly RequestStatus[]).includes(status);

export const ratingSchema = z.coerce
  .number({ error: "Выберите оценку от 1 до 5" })
  .int("Выберите оценку от 1 до 5")
  .min(1, "Выберите оценку от 1 до 5")
  .max(5, "Выберите оценку от 1 до 5");

export const ratingCommentSchema = z
  .string()
  .trim()
  .max(300, "Не длиннее 300 символов")
  .transform((s) => (s === "" ? null : s));

type RatingRow = {
  rating: number | null;
  ratingComment: string | null;
  ratedAt: Date | null;
  type: { code: string; title: string };
};

const average = (xs: number[]) =>
  xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;

/**
 * Сводка «Что говорят студенты» для сотрудника (T14): средняя по всем и по типам справок (хуже — выше:
 * сотруднику важнее, где плохо) и отзывы с комментарием — сначала низкие оценки. Строки — от новых к старым.
 */
export function summarizeRatings(rows: RatingRow[], recentCount = 3) {
  const rated = rows.filter((r): r is RatingRow & { rating: number } => r.rating !== null);
  const byCode = new Map<string, { code: string; title: string; ratings: number[] }>();
  for (const r of rated) {
    const t = byCode.get(r.type.code) ?? { code: r.type.code, title: r.type.title, ratings: [] };
    t.ratings.push(r.rating);
    byCode.set(r.type.code, t);
  }
  const byType = [...byCode.values()]
    .map((t) => ({
      code: t.code,
      title: t.title,
      count: t.ratings.length,
      average: average(t.ratings)!,
    }))
    .sort((a, b) => a.average - b.average || b.count - a.count);
  // Отзывы с комментарием: сначала низкие оценки (сотруднику важнее, что не так), внутри — новые первыми.
  // Строки уже от новых к старым, а сортировка устойчива
  const recent = rated
    .filter((r) => r.ratingComment)
    .sort((a, b) => a.rating - b.rating)
    .slice(0, recentCount)
    .map((r) => ({
      typeTitle: r.type.title,
      rating: r.rating,
      comment: r.ratingComment!,
      ratedAt: r.ratedAt,
    }));
  return { count: rated.length, average: average(rated.map((r) => r.rating)), byType, recent };
}

export type RatingsSummary = ReturnType<typeof summarizeRatings>;

// ── Срок и просрочка ──

/** Ожидаемая готовность: срок типа в рабочих днях от подачи (как на «Сейчас»). */
export const dueDate = (createdAt: Date, slaDays: number) => addBusinessDays(createdAt, slaDays);

const DAY_MS = 24 * 60 * 60 * 1000;

/** Сколько календарных дней заявка просрочена (по Москве); 0 — не просрочена или уже не в работе. */
export function overdueDays(
  r: { status: RequestStatus; createdAt: Date; slaDays: number },
  now: Date,
): number {
  if (!(PENDING_STATUSES as readonly string[]).includes(r.status)) return 0;
  const days = Math.round(
    (+mskStartOfDay(now) - +mskStartOfDay(dueDate(r.createdAt, r.slaDays))) / DAY_MS,
  );
  return Math.max(0, days);
}

// ── Пакетная обработка (T14+): «номер|статус, который видел сотрудник», куда и каким шаблоном ──

export const BATCH_MAX = 50;
const batchPickSchema = z
  .string()
  .regex(/^[СCсc]-\d{4}-\d{5,9}\|(SUBMITTED|ACCEPTED|IN_PROGRESS|READY)$/u)
  .transform((s) => {
    const [number, from] = s.split("|") as [string, RequestStatus];
    return { number: normalizeRequestNumber(number), from };
  });

export const batchFormSchema = z
  .object({
    picks: z
      .array(batchPickSchema, { error: "Отметьте заявки" })
      .min(1, "Отметьте заявки")
      .max(BATCH_MAX, `Не больше ${BATCH_MAX} заявок за раз`)
      .refine((p) => new Set(p.map((x) => x.number)).size === p.length, "Заявка выбрана дважды"),
    to: z.enum(BATCH_TARGETS, { error: "Выберите действие" }),
    template: z.union([
      z.literal("none"),
      z.enum(REPLY_TEMPLATES.map((t) => t.id) as [ReplyTemplateId, ...ReplyTemplateId[]]),
    ]),
  })
  .refine(
    (f) => f.template === "none" || REPLY_TEMPLATES.find((t) => t.id === f.template)!.to === f.to,
    { message: "Шаблон не подходит к действию", path: ["template"] },
  );

export const readBatchForm = (fd: FormData) => ({
  picks: fd.getAll("pick"),
  to: fd.get("to") ?? undefined,
  template: fd.get("template") ?? "none",
});

/** Срок — сегодня: заявка ждёт действия, ещё не просрочена, а ожидаемая готовность — сегодня (по Москве). */
export function isDueToday(
  r: { status: RequestStatus; overdue: number; dueAt: Date },
  now: Date,
): boolean {
  return (
    (PENDING_STATUSES as readonly string[]).includes(r.status) &&
    r.overdue <= 0 &&
    mskDateKey(r.dueAt) === mskDateKey(now)
  );
}

// ── Утренний брифинг сотрудника (T14+): подсчёты, без ИИ ──

export type Briefing = {
  /** Просрочены или срок — сегодня */
  urgent: number;
  /** Из них просрочены — для тона строки */
  overdue: number;
  /** «Готова к выдаче» — можно выдать пачкой */
  ready: number;
  /** Подано со вчерашнего утра и ещё не принято */
  fresh: number;
  /** Черновики ответов помощника своих факультетов — ждут проверки */
  drafts: number;
};

export function summarizeBriefing(
  items: { status: RequestStatus; overdue: number; dueAt: Date; createdAt: Date }[],
  drafts: number,
  now: Date,
): Briefing {
  const since = addDays(mskStartOfDay(now), -1);
  return {
    urgent: items.filter((i) => i.overdue > 0 || isDueToday(i, now)).length,
    overdue: items.filter((i) => i.overdue > 0).length,
    ready: items.filter((i) => i.status === "READY").length,
    fresh: items.filter((i) => i.status === "SUBMITTED" && i.createdAt >= since).length,
    drafts,
  };
}

// ── Таймлайн: Подана → Принята → В работе → Готова → Выдана ──

export const STEPS = ["SUBMITTED", "ACCEPTED", "IN_PROGRESS", "READY", "ISSUED"] as const;
export type Step = (typeof STEPS)[number];

export const STEP_LABEL: Record<Step, string> = {
  SUBMITTED: "Подана",
  ACCEPTED: "Принята",
  IN_PROGRESS: "В работе",
  READY: "Готова",
  ISSUED: "Выдана",
};

export type TimelineStep = {
  status: Step;
  label: string;
  state: "done" | "current" | "upcoming";
  at: Date | null;
  comment: string | null;
};

export type Timeline = {
  steps: TimelineStep[];
  /** Финал вне пути: отклонена или отменена — с датой и причиной */
  end: { status: "REJECTED" | "CANCELLED"; at: Date | null; comment: string | null } | null;
  /** Ожидаемая готовность — пока заявка в работе у деканата */
  dueAt: Date | null;
};

type EventLike = { status: RequestStatus; createdAt: Date; comment: string | null };

export function timelineOf(r: {
  status: RequestStatus;
  createdAt: Date;
  slaDays: number;
  events: EventLike[];
}): Timeline {
  const last = (s: RequestStatus) => r.events.filter((e) => e.status === s).at(-1) ?? null;
  const isEnd = r.status === "REJECTED" || r.status === "CANCELLED";
  // Докуда дошли: текущий статус или (для финала вне пути) последний пройденный шаг
  const reached = isEnd
    ? Math.max(0, ...r.events.map((e) => STEPS.indexOf(e.status as Step)))
    : STEPS.indexOf(r.status as Step);

  const steps: TimelineStep[] = STEPS.map((status, i) => {
    const e = last(status);
    const state: TimelineStep["state"] =
      i < reached || (isEnd && i === reached) ? "done" : i === reached ? "current" : "upcoming";
    return {
      status,
      label: STEP_LABEL[status],
      state,
      at: e?.createdAt ?? (status === "SUBMITTED" ? r.createdAt : null),
      comment: e?.comment ?? null,
    };
  }).filter((s) => !(isEnd && s.state === "upcoming"));

  const endEvent = isEnd ? last(r.status) : null;
  return {
    steps,
    end: isEnd
      ? {
          status: r.status as "REJECTED" | "CANCELLED",
          at: endEvent?.createdAt ?? null,
          comment: endEvent?.comment ?? null,
        }
      : null,
    dueAt: (PENDING_STATUSES as readonly string[]).includes(r.status)
      ? dueDate(r.createdAt, r.slaDays)
      : null,
  };
}

// ── Уведомление студенту о смене статуса ──

export function notificationFor(
  to: RequestStatus,
  typeTitle: string,
  comment: string | null,
): { title: string; body: string } {
  const tail = comment ? ` ${comment}` : "";
  switch (to) {
    case "ACCEPTED":
      return { title: "Заявка принята", body: `${typeTitle}: деканат принял заявку.${tail}` };
    case "IN_PROGRESS":
      return { title: "Заявка в работе", body: `${typeTitle}: деканат готовит документ.${tail}` };
    case "READY":
      return { title: "Справка готова", body: `${typeTitle} готова — заберите в деканате.${tail}` };
    case "ISSUED":
      return { title: "Справка выдана", body: `${typeTitle}: выдана.${tail}` };
    case "REJECTED":
      return { title: "Заявка отклонена", body: comment ?? `${typeTitle}: заявка отклонена.` };
    default:
      return { title: "Статус заявки изменён", body: typeTitle };
  }
}

/** Карточка заявки в кабинете сотрудника. */
export const staffRequestHref = (number: string) => `/staff/requests/${encodeURIComponent(number)}`;

/** Ссылка заявки внутри кабинета студента. */
export const requestHref = (number: string) => `/requests/${encodeURIComponent(number)}`;

/** Проверка ссылки уведомления переехала в src/lib/links.ts (T09): ею пользуются и объявления, и переносы. */
export { safeLink } from "@/lib/links";
