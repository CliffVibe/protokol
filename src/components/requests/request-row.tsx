// Строка заявки в списке (T08): строки под линиями, касание по всей строке ведёт в заявку.
import Link from "next/link";
import type { Route } from "next";
import type { RequestStatus } from "@/generated/prisma/client";
import { formatRelativeDay } from "@/lib/dates";
import { requestStatus } from "@/components/now/labels";
import { StatusChip } from "@/components/status-chip";
import { requestHref } from "@/server/services/request-rules";

type Row = {
  number: string;
  status: RequestStatus;
  createdAt: Date;
  updatedAt: Date;
  type: { title: string };
  dueAt?: Date;
};

/** Что важно знать о заявке сейчас: срок, «заберите» или когда закрыта. */
function whenText(r: Row, now: Date): string {
  // «Заберите» уже в чипе — здесь только когда стала готова
  if (r.status === "READY") return `Готова ${formatRelativeDay(r.updatedAt, now)}`;
  if (r.dueAt) return `Готова к ${formatRelativeDay(r.dueAt, now)}`;
  return `${requestStatus(r.status).label}: ${formatRelativeDay(r.updatedAt, now)}`;
}

export function RequestRow({ request: r, now }: { request: Row; now: Date }) {
  const status = requestStatus(r.status);
  return (
    <li className="relative flex flex-col gap-1.5 py-4">
      <Link
        href={requestHref(r.number) as Route}
        className="self-start text-base font-bold text-ink outline-none after:absolute after:inset-0 after:rounded-sm hover:underline focus-visible:after:ring-2 focus-visible:after:ring-brand"
      >
        {r.type.title}
      </Link>
      <p className="text-sm text-ink-muted tabular">
        № {r.number}, подана {formatRelativeDay(r.createdAt, now)}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusChip tone={status.tone}>{status.label}</StatusChip>
        <span className="text-sm text-ink">{whenText(r, now)}</span>
      </div>
    </li>
  );
}
