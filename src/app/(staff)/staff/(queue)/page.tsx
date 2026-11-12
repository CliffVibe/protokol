import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { z } from "zod";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { BatchBar, BatchPicker } from "@/components/staff/batch-bar";
import { requestStatus } from "@/components/now/labels";
import { STAFF_READY_LABEL } from "@/components/staff/labels";
import { BriefingBlock } from "@/components/staff/briefing";
import { QueueRow, shortName } from "@/components/staff/queue-row";
import { RatingsSummaryBlock } from "@/components/staff/ratings-summary";
import { Button } from "@/components/ui/button";
import { plural } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { requireStaff } from "@/server/auth/guards";
import { staffIdentity } from "@/server/repos/staff-profile";
import { BATCH_TARGETS, type BatchTarget } from "@/lib/reply-templates";
import { addDays, mskStartOfDay } from "@/lib/msk";
import { isDueToday, TRANSITIONS } from "@/server/services/request-rules";
import { getBriefing, getQueue, getRatingsSummary } from "@/server/services/requests";
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

/** T14+: куда каждую заявку можно перевести пачкой — шаги вперёд из TRANSITIONS, без отклонения */
const BATCH_FORWARD: Record<string, BatchTarget[]> = Object.fromEntries(
  Object.entries(TRANSITIONS).map(([from, next]) => [
    from,
    next.filter((t): t is BatchTarget => (BATCH_TARGETS as readonly string[]).includes(t)),
  ]),
);

const groupSchema = z.enum(Object.keys(GROUPS) as [Group, ...Group[]]);
const idSchema = z.string().regex(/^[a-z0-9-]{1,64}$/);
const codeSchema = z.string().regex(/^[a-z_]{1,40}$/);

function href(params: {
  status: Group;
  faculty: string | null;
  type: string | null;
  due?: "urgent" | "new";
}) {
  const q = new URLSearchParams();
  if (params.status !== "pending") q.set("status", params.status);
  if (params.due) q.set("due", params.due);
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
  // T14+: из брифинга — «горят» (просрочены или срок сегодня) и «новые» (поданы со вчерашнего утра);
  // только среди «Ждут действия»
  const due = status === "pending" && (sp.due === "urgent" || sp.due === "new") ? sp.due : null;
  const urgent = due === "urgent";
  // Брифинг — только на «чистом» /staff: на других вкладках и фильтрах он лишь отодвигает очередь
  const showBriefing = status === "pending" && !due && !faculty && !type;

  const now = new Date();
  const [{ items: all, faculties, types }, ratings, briefing, who] = await Promise.all([
    getQueue(
      ctx,
      { statuses: [...GROUPS[status].statuses], facultyId: faculty, typeCode: type },
      now,
    ),
    // Сводка второстепенна: сбой — строка «не загрузилась», а не ошибка всей очереди (ux-reviewer, T14)
    getRatingsSummary(ctx).catch(() => null),
    // Брифинг тоже: без него очередь работает (T14+)
    showBriefing ? getBriefing(ctx, now).catch(() => null) : null,
    showBriefing ? staffIdentity(ctx).catch(() => null) : null,
  ]);
  const since = addDays(mskStartOfDay(now), -1);
  const items =
    due === "urgent"
      ? all.filter((i) => i.overdue > 0 || isDueToday(i, now))
      : due === "new"
        ? all.filter((i) => i.status === "SUBMITTED" && i.createdAt >= since)
        : all;
  // T14+: однофамильцы в одной группе — у них в строке хвост зачётки (решение человека 12.11). Однофамильцы —
  // одинаковые «Фамилия И. О.» и группа при РАЗНЫХ зачётках: один студент с двумя заявками — не однофамилец
  const tails = new Map<string, Set<string>>();
  for (const i of items) {
    const key = personKey(i.student);
    tails.set(key, (tails.get(key) ?? new Set()).add(i.student.recordBookTail));
  }
  const namesakes = new Set([...tails].filter(([, t]) => t.size > 1).map(([k]) => k));
  // T14+: пачкой — там, где есть шаги вперёд: «Ждут действия» (и «горят») и «Готовы к выдаче»
  const batchable = status === "pending" || status === "ready";
  const overdue = items.filter((i) => i.overdue > 0).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Очередь заявок"
        description={
          showBriefing
            ? "Заявки студентов ваших факультетов — просроченные наверху."
            : overdue
              ? `${overdue} ${plural(overdue, ["заявка просрочена — она", "заявки просрочены — они", "заявок просрочено — они"])} наверху списка.`
              : "Заявки студентов ваших факультетов — по сроку."
        }
      />

      {showBriefing ? (
        <BriefingBlock briefing={briefing} fullName={who?.fullName ?? null} now={now} />
      ) : null}

      {/* Очередь — свой раздел в навигации по заголовкам (иначе она попадала под «Главное на сегодня») */}
      <h2 className="sr-only">Заявки</h2>

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
        {due ? <input type="hidden" name="due" value={due} /> : null}
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

      {due ? (
        // Фильтр из брифинга виден и снимается одним касанием — иначе «куда делись заявки?»
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-ink">
          <span>
            {urgent
              ? "Только горящие: просрочены или срок — сегодня."
              : "Только новые: поданы со вчерашнего утра."}
          </span>
          <Link
            href={href({ status, faculty, type })}
            className="inline-flex min-h-11 items-center font-bold text-brand underline-offset-4 hover:underline"
          >
            Показать все
          </Link>
        </p>
      ) : null}

      {items.length && batchable ? <BatchPicker groups={pickGroups(items)} /> : null}

      {items.length ? (
        <ul
          aria-label="Заявки в очереди"
          className="flex flex-col divide-y divide-line border-y border-line"
        >
          {items.map((r) => (
            <QueueRow
              key={r.number}
              item={r}
              now={now}
              namesake={namesakes.has(personKey(r.student))}
              pick={batchable && (BATCH_FORWARD[r.status]?.length ?? 0) > 0}
            />
          ))}
        </ul>
      ) : null}
      {items.length && batchable ? <BatchBar forward={BATCH_FORWARD} /> : null}
      {items.length ? null : (
        <EmptyState
          title={
            due === "new"
              ? "Новых заявок нет"
              : urgent
                ? "Горящих заявок нет"
                : status === "pending"
                  ? "Новых заявок нет"
                  : "Здесь пусто"
          }
          description={
            urgent
              ? "Просроченных и со сроком сегодня нет — можно заняться остальными."
              : status === "pending"
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

/** «Выбрать «Подана» (2)» — по одной кнопке на статус, у которого есть шаг вперёд пачкой. */
function pickGroups(items: { status: RequestStatus }[]) {
  const counts = new Map<RequestStatus, number>();
  for (const i of items)
    if ((BATCH_FORWARD[i.status]?.length ?? 0) > 0)
      counts.set(i.status, (counts.get(i.status) ?? 0) + 1);
  return [...counts.entries()].map(([status, count]) => ({
    status,
    label: status === "READY" ? STAFF_READY_LABEL : requestStatus(status).label,
    count,
  }));
}

/** «Савельев И. А.|2МО-1» — кого сотрудник по строке не отличит: та же фамилия, инициалы и группа. */
const personKey = (s: Parameters<typeof shortName>[0] & { group: { name: string } }) =>
  `${shortName(s)}|${s.group.name}`;
