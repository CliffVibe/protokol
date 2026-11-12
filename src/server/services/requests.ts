import "server-only";
import { z } from "zod";
import type { RequestStatus } from "@/generated/prisma/client";
import type { StaffCtx, StudentCtx } from "@/server/auth/guards";
import {
  cancelRequest,
  createRequest,
  rateRequest,
  recentAutoIssuedCount,
  requestByNumber,
  requestsOf,
  requestTypes,
} from "@/server/repos/requests";
import {
  autoIssuedCount,
  batchMetaFor,
  changeStatus,
  queueFor,
  ratingsOf,
  revokeDocument,
  queueOptions,
  staffRequestByNumber,
  type ChangeResult,
  type QueueFilters,
  type RevokeResult,
} from "@/server/repos/staff-requests";
import { countFaqDrafts } from "@/server/repos/faq-entries";
import { gradesOf } from "@/server/repos/grades";
import { addDays, mskStartOfDay } from "@/lib/msk";
import { summarizeStudy } from "./academics";
import {
  AUTO_EVENT_COMMENT,
  AUTO_ISSUE_TYPES,
  AUTO_ISSUE_WINDOW_DAYS,
  autoIssueDecision,
  exceptionComment,
} from "./auto-issue-rules";
import {
  REPLY_TEMPLATES,
  renderTemplate,
  type BatchTarget,
  type ReplyTemplateId,
} from "@/lib/reply-templates";
import { sortRequests } from "./now";
import {
  ACTIVE_STATUSES,
  buildPayloadSchema,
  canTransition,
  dueDate,
  isRatable,
  overdueDays,
  parseFields,
  PENDING_STATUSES,
  summarizeBriefing,
  summarizeRatings,
  timelineOf,
  TRANSITIONS,
  type FieldSpec,
} from "./request-rules";

// Заявки (T08): сценарии 3, 4, 6. Данные — только через repos (S1), правила — request-rules.ts.

// ── Студент ──

export async function getMyRequests(ctx: StudentCtx) {
  const rows = await requestsOf(ctx);
  const isActive = (s: RequestStatus) => (ACTIVE_STATUSES as readonly string[]).includes(s);
  return {
    // «Готова — заберите» первой, срок — в рабочих днях (как на «Сейчас»)
    active: sortRequests(rows.filter((r) => isActive(r.status))),
    archive: rows.filter((r) => !isActive(r.status)),
  };
}

const payloadRecord = z.record(z.string(), z.string());

/** Что студент указал в заявке — подписями полей типа (неизвестные ключи не показываем). */
export function labeledPayload(
  fields: FieldSpec[] | null,
  payload: unknown,
): { label: string; value: string }[] {
  const values = payloadRecord.safeParse(payload);
  if (!fields || !values.success) return [];
  return fields
    .filter((f) => values.data[f.name])
    .map((f) => ({ label: f.label, value: values.data[f.name]! }));
}

export async function getMyRequest(ctx: StudentCtx, number: string) {
  const r = await requestByNumber(ctx, number);
  if (!r) return null;
  const canDownload =
    (r.status === "READY" || r.status === "ISSUED") && !!r.document && !r.document.revoked;
  return {
    ...r,
    // Ссылка на публичную проверку — только когда есть действующая справка (как QR в PDF)
    verifyHref: canDownload && r.document ? `/verify/${r.document.verifyToken}` : null,
    timeline: timelineOf({ ...r, slaDays: r.type.slaDays }),
    fields: labeledPayload(parseFields(r.type.fields), r.payload),
    canCancel: r.status === "SUBMITTED",
    // T14: оценить можно «Готова»/«Выдана», один раз
    canRate: isRatable(r.status) && r.rating === null,
    // PDF с QR (T10): готова или выдана и документ не отозван; то же условие — в documentForPdf
    canDownload,
  };
}

/** Каталог: только типы с корректным описанием полей (битое — не предлагаем). */
export async function getCatalog(ctx: StudentCtx) {
  const types = await requestTypes(ctx);
  return types.flatMap((t) => {
    const fields = parseFields(t.fields);
    return fields ? [{ ...t, fields }] : [];
  });
}

export type CatalogType = Awaited<ReturnType<typeof getCatalog>>[number];

export async function getRequestType(ctx: StudentCtx, code: string) {
  return (await getCatalog(ctx)).find((t) => t.code === code) ?? null;
}

export type SubmitResult =
  { ok: true; number: string } | { ok: false; fieldErrors: Record<string, string> };

/** Подать заявку: zod-схема строится из описания полей типа на сервере. */
export async function submitRequest(
  ctx: StudentCtx,
  input: {
    code: string;
    language: unknown;
    payload: Record<string, unknown>;
    clientKey: string;
    /** T14: заявку предложил деканат («Вам положено») — проверяет вызывающий (services/offers.ts) */
    offered?: boolean;
  },
): Promise<SubmitResult> {
  const type = await getRequestType(ctx, input.code);
  if (!type) return { ok: false, fieldErrors: { form: "Такой справки нет — выберите из списка" } };
  const parsed = buildPayloadSchema(type.fields, type.languages).safeParse({
    language: input.language,
    payload: input.payload,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.at(-1) === "language" ? "language" : String(issue.path.at(-1));
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, fieldErrors };
  }
  // «Справка за 10 секунд» (T14+): типовую справку кабинет выдаёт сам; решение — по данным из repos (S1),
  // не по форме. Повтор той же формы (clientKey) не выдаёт вторую: createRequest вернёт уже созданную
  const decision = (AUTO_ISSUE_TYPES as readonly string[]).includes(type.code)
    ? autoIssueDecision({
        typeCode: type.code,
        payload: parsed.data.payload,
        debts: summarizeStudy(await gradesOf(ctx))?.debts ?? 0,
        recentAuto: await recentAutoIssuedCount(
          ctx,
          type.id,
          addDays(new Date(), -AUTO_ISSUE_WINDOW_DAYS),
        ),
      })
    : ({ auto: false, reason: null } as const);
  const number = await createRequest(ctx, {
    typeId: type.id,
    language: parsed.data.language,
    payload: decision.auto ? decision.payload : parsed.data.payload,
    clientKey: input.clientKey,
    offered: input.offered,
    autoIssue: decision.auto
      ? {
          acceptedComment: AUTO_EVENT_COMMENT.ACCEPTED,
          issuedComment: AUTO_EVENT_COMMENT.ISSUED,
          notice: {
            title: "Справка готова",
            body: `${type.title} выдана автоматически, без очереди. PDF с QR-кодом — в заявке.`,
          },
        }
      : undefined,
    submittedComment: !decision.auto && decision.reason ? exceptionComment(decision.reason) : null,
  });
  return { ok: true, number };
}

export async function cancelMyRequest(ctx: StudentCtx, number: string): Promise<boolean> {
  return cancelRequest(ctx, number);
}

/** Оценка решения своей заявки (T14). false — нельзя (чужая, не тот статус, уже оценена). */
export async function rateMyRequest(
  ctx: StudentCtx,
  number: string,
  input: { rating: number; comment: string | null },
): Promise<boolean> {
  return rateRequest(ctx, number, input);
}

// ── Сотрудник ──

export async function getQueue(ctx: StaffCtx, filters: QueueFilters, now: Date) {
  const [rows, options] = await Promise.all([queueFor(ctx, filters), queueOptions(ctx)]);
  const items = rows
    .map((r) => ({
      ...r,
      dueAt: dueDate(r.createdAt, r.type.slaDays),
      overdue: overdueDays({ ...r, slaDays: r.type.slaDays }, now),
    }))
    // Просроченные первыми, дальше — по сроку
    .sort((a, b) => b.overdue - a.overdue || +a.dueAt - +b.dueAt);
  return { items, ...options };
}

export type QueueItem = Awaited<ReturnType<typeof getQueue>>["items"][number];

/** Утренний брифинг (T14+): вся очередь своих факультетов «ждут действия» и «готовы» + черновики ответов. */
export async function getBriefing(ctx: StaffCtx, now: Date) {
  const [{ items }, drafts, autoIssued] = await Promise.all([
    getQueue(
      ctx,
      { statuses: [...PENDING_STATUSES, "READY"], facultyId: null, typeCode: null },
      now,
    ),
    countFaqDrafts(ctx),
    // «За неделю»: сегодня и шесть дней до него
    autoIssuedCount(ctx, addDays(mskStartOfDay(now), -6)),
  ]);
  return summarizeBriefing(items, drafts, now, autoIssued);
}

/** «Что говорят студенты» (T14): оценки заявок своих факультетов, без имён. */
export async function getRatingsSummary(ctx: StaffCtx) {
  return summarizeRatings(await ratingsOf(ctx));
}

export async function getStaffRequest(ctx: StaffCtx, number: string) {
  const r = await staffRequestByNumber(ctx, number);
  if (!r) return null;
  return {
    ...r,
    timeline: timelineOf({ ...r, slaDays: r.type.slaDays }),
    fields: labeledPayload(parseFields(r.type.fields), r.payload),
    next: TRANSITIONS[r.status],
  };
}

export type SetStatusResult = ChangeResult | "forbidden_transition";

export async function setStatus(
  ctx: StaffCtx,
  input: { number: string; from: RequestStatus; to: RequestStatus; comment: string | null },
): Promise<SetStatusResult> {
  // Переход проверяем на сервере: скрытая кнопка — не защита (S1)
  if (!canTransition(input.from, input.to)) return "forbidden_transition";
  return changeStatus(ctx, input);
}

export type BatchResult = { done: number; stale: number; skipped: number; ignored: number };

/**
 * Пакетная смена статуса (T14+). Каждая заявка — тем же путём, что одиночная (переход, факультет,
 * «статус всё ещё from», событие, уведомление, документ при «Готова»), и в СВОЕЙ транзакции: одна устаревшая
 * не откатывает остальные. ignored — у заявки другой статус и этот шаг к ней не относится (в «Ждут действия»
 * выбор смешанный: «Принять» касается только поданных); stale — статус уже изменили; skipped — чужая или
 * несуществующая (не различаем: не подтверждаем существование чужого). Текст шаблона собирается для каждой заявки.
 */
export async function batchSetStatus(
  ctx: StaffCtx,
  input: {
    picks: { number: string; from: RequestStatus }[];
    to: BatchTarget;
    template: ReplyTemplateId | "none";
  },
  now: Date,
): Promise<BatchResult> {
  const meta = new Map(
    (
      await batchMetaFor(
        ctx,
        input.picks.map((p) => p.number),
      )
    ).map((m) => [m.number, m]),
  );
  const template = REPLY_TEMPLATES.find((t) => t.id === input.template) ?? null;
  const result: BatchResult = { done: 0, stale: 0, skipped: 0, ignored: 0 };
  // По очереди, не параллельно: 50 транзакций разом заняли бы весь пул соединений
  for (const p of input.picks) {
    const m = meta.get(p.number);
    if (!canTransition(p.from, input.to)) {
      result.ignored++;
      continue;
    }
    if (!m) {
      result.skipped++;
      continue;
    }
    const comment = template
      ? renderTemplate(template, {
          typeTitle: m.type.title,
          dueAt: dueDate(m.createdAt, m.type.slaDays),
          now,
        })
      : null;
    const r = await changeStatus(ctx, { number: p.number, from: p.from, to: input.to, comment });
    if (r === "ok") result.done++;
    else if (r === "conflict") result.stale++;
    else result.skipped++;
  }
  return result;
}

/** Отозвать справку (T10): факультет и «ещё не отозвана» проверяет репозиторий. */
export async function revokeCertificate(
  ctx: StaffCtx,
  input: { number: string; reason: string },
): Promise<RevokeResult> {
  return revokeDocument(ctx, input);
}
