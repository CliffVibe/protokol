import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PageHeader } from "@/components/page-header";
import { requestStatus } from "@/components/now/labels";
import { CancelRequest } from "@/components/requests/cancel-request";
import { RequestTimeline } from "@/components/requests/timeline";
import { StatusChip } from "@/components/status-chip";
import { formatRelativeDay } from "@/lib/dates";
import { requireStudent } from "@/server/auth/guards";
import { LANGUAGE_LABEL, requestNumberSchema } from "@/server/services/request-rules";
import { getMyRequest } from "@/server/services/requests";

// Заявка студента (T08, сценарии 4 и 6). Номер из адреса — только формат через zod; чья — решает
// репозиторий (WHERE number AND studentId, S1). Чужая или несуществующая → 404, а не 403.
// Своего loading.tsx нет намеренно: проверка владельца — до начала стрима, и чужой номер получает
// настоящий HTTP 404 (тест 1 в docs/05-security.md). Один загрузчик на запрос — и для <title>.
const load = cache(async (raw: string) => {
  const ctx = await requireStudent();
  const number = requestNumberSchema.safeParse(safeDecode(raw));
  if (!number.success) return null;
  return getMyRequest(ctx, number.data);
});

/** Битая %-последовательность в адресе — не 500, а «нет такой заявки». */
function safeDecode(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: PageProps<"/requests/[number]">): Promise<Metadata> {
  const r = await load((await params).number);
  return { title: r ? `${r.type.title}, № ${r.number}` : "Заявка не найдена" };
}

export default async function RequestPage({ params }: PageProps<"/requests/[number]">) {
  await requireStudent();
  const r = await load((await params).number);
  if (!r) notFound();
  const now = new Date();
  const status = requestStatus(r.status);

  return (
    <div className="flex flex-col gap-8 lg:max-w-2xl">
      <PageHeader
        title={r.type.title}
        back={{ href: "/requests", label: "Заявки" }}
        description={<span className="tabular">№ {r.number}</span>}
      />

      <section aria-labelledby="state-title" className="flex flex-col gap-3">
        <h2 id="state-title" className="sr-only">
          Статус
        </h2>
        <StatusChip tone={status.tone} className="self-start">
          {status.label}
        </StatusChip>
        {r.status === "READY" ? (
          <p className="text-base text-ink">
            <span className="font-bold">Справка готова.</span> Заберите её в деканате своего
            факультета — с паспортом или студенческим билетом.
          </p>
        ) : null}
        {r.timeline.dueAt ? (
          <p className="text-base text-ink">
            Ожидаемая готовность:{" "}
            <span className="font-bold">{formatRelativeDay(r.timeline.dueAt, now)}</span>
          </p>
        ) : null}
      </section>

      <section aria-labelledby="timeline-title" className="flex flex-col gap-3">
        <h2 id="timeline-title" className="text-xl">
          Как движется заявка
        </h2>
        <div className="border-t border-line pt-4">
          <RequestTimeline timeline={r.timeline} now={now} />
        </div>
      </section>

      <section aria-labelledby="given-title" className="flex flex-col gap-3">
        <h2 id="given-title" className="text-xl">
          Что вы указали
        </h2>
        <dl className="flex flex-col gap-3 border-t border-line pt-4 text-base">
          <div className="flex flex-col gap-0.5">
            <dt className="text-sm text-ink-muted">Язык справки</dt>
            <dd className="text-ink">{LANGUAGE_LABEL[r.language] ?? r.language}</dd>
          </div>
          {r.fields.map((f) => (
            <div key={f.label} className="flex flex-col gap-0.5">
              <dt className="text-sm text-ink-muted">{f.label}</dt>
              <dd className="break-words text-ink">{f.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {r.canCancel ? (
        <div className="flex flex-col items-start gap-2 border-t border-line pt-4">
          <p className="text-sm text-ink-muted">
            Пока деканат не принял заявку, её можно отменить.
          </p>
          <CancelRequest number={r.number} />
        </div>
      ) : null}
    </div>
  );
}
