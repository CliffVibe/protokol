// Строка очереди сотрудника (T08): тип, студент (Фамилия И. О., группа), номер, статус, срок.
// Просрочка — чип danger + иконка + текст «Просрочена на 2 дня», не только цвет.
import Link from "next/link";
import type { Route } from "next";
import { AlarmClock } from "lucide-react";
import { formatRelativeDay, plural } from "@/lib/dates";
import { mskDateKey } from "@/lib/msk";
import { requestStatus } from "@/components/now/labels";
import { STAFF_READY_LABEL } from "./labels";
import { StatusChip } from "@/components/status-chip";
import { staffRequestHref } from "@/server/services/request-rules";
import type { QueueItem } from "@/server/services/requests";

/** «Морозова И. С.» */
export function shortName(s: { lastName: string; firstName: string; middleName: string | null }) {
  return `${s.lastName} ${s.firstName[0]}.${s.middleName ? ` ${s.middleName[0]}.` : ""}`;
}

export function QueueRow({ item: r, now }: { item: QueueItem; now: Date }) {
  const base = requestStatus(r.status);
  // «Готова — заберите» — для студента; сотруднику — «Готова к выдаче» (ux-reviewer, T08)
  const status = r.status === "READY" ? { ...base, label: STAFF_READY_LABEL } : base;
  const active = ["SUBMITTED", "ACCEPTED", "IN_PROGRESS"].includes(r.status);
  const dueToday = active && r.overdue <= 0 && mskDateKey(r.dueAt) === mskDateKey(now);
  return (
    // ≥ 1024 — сетка «тип и студент | номер | статус и срок»: сотрудник пробегает очередь глазами много раз
    // в день, статусы и сроки должны стоять столбцом (ux-reviewer, T13). На телефоне — как было, строками
    <li className="relative flex flex-col gap-1.5 py-4 lg:grid lg:grid-cols-[minmax(0,1fr)_12rem_13rem] lg:items-center lg:gap-x-6 lg:py-3">
      <div className="flex min-w-0 flex-col gap-1.5 lg:gap-0.5">
        <Link
          href={staffRequestHref(r.number) as Route}
          className="self-start text-base font-bold break-words text-ink outline-none after:absolute after:inset-0 after:rounded-sm hover:underline focus-visible:after:outline-2 focus-visible:after:outline-solid focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring"
        >
          {r.type.title}
        </Link>
        <p className="text-base text-ink">
          {shortName(r.student)}, {r.student.group.name}
          <span className="text-ink-muted"> ({r.student.group.program.faculty.code})</span>
        </p>
      </div>
      <p className="text-sm text-ink-muted tabular">
        №&nbsp;{r.number}, подана {formatRelativeDay(r.createdAt, now)}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusChip tone={status.tone}>{status.label}</StatusChip>
        {r.overdue > 0 ? (
          <StatusChip tone="danger" icon={AlarmClock}>
            Просрочена на {r.overdue} {plural(r.overdue, ["день", "дня", "дней"])}
          </StatusChip>
        ) : dueToday ? (
          // Срок сегодня — риск: значок + текст + цвет --warn (Б′), а не обычная строка (ux-reviewer, T13)
          <span className="inline-flex items-center gap-1 text-sm font-bold text-warn">
            <AlarmClock aria-hidden className="size-4 shrink-0" />
            Срок — сегодня
          </span>
        ) : active ? (
          <span className="text-sm text-ink">Срок — {formatRelativeDay(r.dueAt, now)}</span>
        ) : null}
      </div>
    </li>
  );
}
