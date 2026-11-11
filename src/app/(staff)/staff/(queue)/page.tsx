import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { z } from "zod";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { QueueRow } from "@/components/staff/queue-row";
import { RatingsSummaryBlock } from "@/components/staff/ratings-summary";
import { Button } from "@/components/ui/button";
import { plural } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { requireStaff } from "@/server/auth/guards";
import { getQueue, getRatingsSummary } from "@/server/services/requests";
import type { RequestStatus } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Кабинет деканата" };

// Очередь заявок (T08, сценарий 4): только студенты факультетов сотрудника (S1, в репозитории).
// Фильтры — в адресе, разбирает zod: битое значение — фильтр по умолчанию, не 500. Просроченные первыми.
// Доступ — requireStaff() первой строкой, до любых данных (CLAUDE.md → «Железные правила»).

const GROUPS = {
  pending: { label: "Ждут действия", statuses: ["SUBMITTED", "ACCEPTED", "IN_PROGRESS"] },
  ready: { label: "Готовы к выдаче", statuses: ["READY"] },
  closed: { label: "Закрытые", statuses: ["ISSUED", "REJECTED", "CANCELLED"] },
  all: {
    label: "Все",
    statuses: ["SUBMITTED", "ACCEPTED", "IN_PROGRESS", "READY", "ISSUED", "REJECTED", "CANCELLED"],
  },
} as const satisfies Record<string, { label: string; statuses: readonly RequestStatus[] }>;
type Group = keyof typeof GROUPS;

const groupSchema = z.enum(Object.keys(GROUPS) as [Group, ...Group[]]);
const idSchema = z.string().regex(/^[a-z0-9-]{1,64}$/);
const codeSchema = z.string().regex(/^[a-z_]{1,40}$/);

function href(params: { status: Group; faculty: string | null; type: string | null }) {
  const q = new URLSearchParams();
  if (params.status !== "pending") q.set("status", params.status);
  if (params.faculty) q.set("faculty", params.faculty);
  if (params.type) q.set("type", params.type);
  const s = q.toString();
  return (s ? `/staff?${s}` : "/staff") as Route;
}

export default async function StaffQueuePage({ searchParams }: PageProps<"/staff">) {
  const ctx = await requireStaff();
  const sp = await searchParams;
  const status = groupSchema.catch("pending").parse(sp.status);
  const rawFaculty = idSchema.safeParse(sp.faculty);
  // Факультет — только свой; чужой id молча игнорируем (фильтр в репозитории всё равно по своим)
  const faculty =
    rawFaculty.success && ctx.facultyIds.includes(rawFaculty.data) ? rawFaculty.data : null;
  const rawType = codeSchema.safeParse(sp.type);
  const type = rawType.success ? rawType.data : null;

  const now = new Date();
  const [{ items, faculties, types }, ratings] = await Promise.all([
    getQueue(
      ctx,
      { statuses: [...GROUPS[status].statuses], facultyId: faculty, typeCode: type },
      now,
    ),
    // Сводка второстепенна: сбой — строка «не загрузилась», а не ошибка всей очереди (ux-reviewer, T14)
    getRatingsSummary(ctx).catch(() => null),
  ]);
  const overdue = items.filter((i) => i.overdue > 0).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Очередь заявок"
        description={
          overdue
            ? `${overdue} ${plural(overdue, ["заявка просрочена — она", "заявки просрочены — они", "заявок просрочено — они"])} наверху списка.`
            : "Заявки студентов ваших факультетов — по сроку."
        }
      />

      <nav aria-label="Статус заявок">
        <ul className="flex flex-wrap gap-x-6 border-b border-line">
          {(Object.keys(GROUPS) as Group[]).map((g) => (
            <li key={g}>
              <Link
                href={href({ status: g, faculty, type })}
                aria-current={g === status ? "page" : undefined}
                className={cn(
                  // min-w-11: «Все» короче 44px — цель касания держим и для коротких подписей
                  "-mb-px inline-flex min-h-11 min-w-11 items-center justify-center border-b-2 text-base",
                  g === status
                    ? "border-brand font-bold text-ink"
                    : "border-transparent text-ink-muted hover:text-ink",
                )}
              >
                {GROUPS[g].label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Факультет и тип — обычной GET-формой: работает без JS, адрес можно переслать */}
      <form action="/staff" className="flex flex-wrap items-end gap-3">
        {status !== "pending" ? <input type="hidden" name="status" value={status} /> : null}
        <label className="flex min-w-[min(14rem,100%)] flex-col gap-1.5 text-sm font-bold text-ink">
          Факультет
          <select
            name="faculty"
            defaultValue={faculty ?? ""}
            className="h-11 rounded-lg border border-input bg-surface px-3 text-base font-normal text-ink"
          >
            <option value="">Все мои</option>
            {faculties.map((f) => (
              <option key={f.id} value={f.id}>
                {f.code} — {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[min(16rem,100%)] flex-1 flex-col gap-1.5 text-sm font-bold text-ink">
          Тип справки
          <select
            name="type"
            defaultValue={type ?? ""}
            className="h-11 w-full rounded-lg border border-input bg-surface px-3 text-base font-normal text-ink"
          >
            <option value="">Все типы</option>
            {types.map((t) => (
              <option key={t.code} value={t.code}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline">
          Показать
        </Button>
      </form>

      {items.length ? (
        <ul
          aria-label="Заявки в очереди"
          className="flex flex-col divide-y divide-line border-y border-line"
        >
          {items.map((r) => (
            <QueueRow key={r.number} item={r} now={now} />
          ))}
        </ul>
      ) : (
        <EmptyState
          stampPlace
          title={status === "pending" ? "Новых заявок нет" : "Здесь пусто"}
          description={
            status === "pending"
              ? "Когда студент закажет справку, она появится здесь — с ожидаемым сроком."
              : "По этим фильтрам заявок нет. Попробуйте другой статус или «Все мои»."
          }
        />
      )}

      {/* T14: под очередью, а не над ней — главное на экране остаются заявки */}
      <RatingsSummaryBlock summary={ratings} />
    </div>
  );
}
