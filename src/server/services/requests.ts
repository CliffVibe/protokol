import "server-only";
import { z } from "zod";
import type { RequestStatus } from "@/generated/prisma/client";
import type { StaffCtx, StudentCtx } from "@/server/auth/guards";
import {
  cancelRequest,
  createRequest,
  rateRequest,
  requestByNumber,
  requestsOf,
  requestTypes,
} from "@/server/repos/requests";
import {
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
import { sortRequests } from "./now";
import {
  ACTIVE_STATUSES,
  buildPayloadSchema,
  canTransition,
  dueDate,
  isRatable,
  overdueDays,
  parseFields,
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
  return {
    ...r,
    timeline: timelineOf({ ...r, slaDays: r.type.slaDays }),
    fields: labeledPayload(parseFields(r.type.fields), r.payload),
    canCancel: r.status === "SUBMITTED",
    // T14: оценить можно «Готова»/«Выдана», один раз
    canRate: isRatable(r.status) && r.rating === null,
    // PDF с QR (T10): готова или выдана и документ не отозван; то же условие — в documentForPdf
    canDownload:
      (r.status === "READY" || r.status === "ISSUED") && !!r.document && !r.document.revoked,
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
  const number = await createRequest(ctx, {
    typeId: type.id,
    language: parsed.data.language,
    payload: parsed.data.payload,
    clientKey: input.clientKey,
    offered: input.offered,
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

/** Отозвать справку (T10): факультет и «ещё не отозвана» проверяет репозиторий. */
export async function revokeCertificate(
  ctx: StaffCtx,
  input: { number: string; reason: string },
): Promise<RevokeResult> {
  return revokeDocument(ctx, input);
}
