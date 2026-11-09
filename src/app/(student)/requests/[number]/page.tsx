import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PageHeader } from "@/components/page-header";
import { CircleCheck, FileDown, ShieldX } from "lucide-react";
import { requestStatus } from "@/components/now/labels";
import { CancelRequest } from "@/components/requests/cancel-request";
import { RequestTimeline } from "@/components/requests/timeline";
import { StampRings } from "@/components/stamp-rings";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { formatRelativeDay } from "@/lib/dates";
import { requireStudent } from "@/server/auth/guards";
import { LANGUAGE_LABEL, requestHref, requestNumberSchema } from "@/server/services/request-rules";
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
  // Отозванная справка — не «Выдана» печатью --seal: печать означает действующий документ (ux-reviewer, T10)
  const status = r.document?.revoked
    ? { tone: "danger" as const, label: "Справка отозвана", icon: ShieldX }
    : requestStatus(r.status);

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
        {r.status === "READY" && !r.document?.revoked ? (
          // «Готова» — главный хороший момент заявки: мятный блок (Б′, 10.11), в нём единственная
          // заливная кнопка экрана. Фокус — обводкой цвета текста: ультрамарин на мяте в тёмной теме не виден
          <div className="relative flex flex-col gap-3 overflow-hidden rounded-[1.75rem] bg-mint p-5 text-on-mint">
            <StampRings className="text-on-mint" />
            <p className="relative flex items-center gap-2.5 font-heading text-lg font-semibold">
              <CircleCheck aria-hidden className="size-6 shrink-0" />
              {status.label}
            </p>
            <p className="relative text-base">
              Заберите справку в деканате своего факультета — с паспортом или студенческим билетом.
              {r.canDownload
                ? " Электронную копию с QR-кодом проверки можно скачать уже сейчас."
                : null}
            </p>
            {r.canDownload ? (
              // Обычная ссылка, не <Link>: PDF отдаёт route handler, предзагрузка ему не нужна
              <Button
                asChild
                size="lg"
                className="relative mt-1 w-full whitespace-normal focus-visible:outline-on-mint sm:w-auto sm:self-start"
              >
                <a href={`${requestHref(r.number)}/pdf`} download>
                  <FileDown aria-hidden />
                  Скачать справку (PDF)
                </a>
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <StatusChip
              tone={status.tone}
              icon={"icon" in status ? status.icon : undefined}
              className="self-start"
            >
              {status.label}
            </StatusChip>
            {r.canDownload ? (
              <Button asChild variant="outline" className="self-start">
                <a href={`${requestHref(r.number)}/pdf`} download>
                  <FileDown aria-hidden />
                  Скачать справку (PDF)
                </a>
              </Button>
            ) : null}
          </>
        )}
        {r.document?.revoked ? (
          // Отзыв — сноска с чертой --danger, как ошибка формы, но без role="alert": это состояние, а не
          // ответ на действие. Причину видит только сам студент; на /verify — лишь «Отозвана» (S7)
          <div className="flex gap-2.5 border-l-2 border-danger py-1 pl-3">
            <ShieldX aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
            <div className="flex flex-col gap-0.5">
              <p className="text-base font-bold text-ink">Деканат отозвал справку</p>
              {r.document.revokedReason ? (
                <p className="text-sm break-words text-ink-muted">
                  Причина: {r.document.revokedReason}
                </p>
              ) : null}
              <p className="text-sm text-ink-muted">
                QR-код в скачанной копии теперь показывает «Отозвана». Новая справка получит новый
                QR-код.
              </p>
              <Button asChild variant="outline" className="mt-2 self-start">
                <Link href={`/requests/new?type=${r.type.code}` as Route}>Подать заново</Link>
              </Button>
            </div>
          </div>
        ) : null}
        {r.timeline.dueAt ? (
          <p className="text-base text-ink">
            Ожидаемая готовность:{" "}
            <span className="font-bold">{formatRelativeDay(r.timeline.dueAt, now)}</span>
          </p>
        ) : null}
      </section>

      <section aria-labelledby="timeline-title" className="flex flex-col gap-3">
        <h2 id="timeline-title" className="text-lg">
          Как движется заявка
        </h2>
        <div className="border-t border-line pt-4">
          <RequestTimeline timeline={r.timeline} now={now} />
        </div>
      </section>

      <section aria-labelledby="given-title" className="flex flex-col gap-3">
        <h2 id="given-title" className="text-lg">
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

      {/* Отклонена — не тупик: сразу подать заново ту же справку (ux-reviewer, T08) */}
      {r.status === "REJECTED" || r.status === "CANCELLED" ? (
        <div className="flex flex-col items-start gap-2 border-t border-line pt-4">
          <p className="text-sm text-ink-muted">
            {r.status === "REJECTED"
              ? "Исправьте то, что указано в причине, и отправьте заявку ещё раз."
              : "Если справка всё-таки нужна — закажите её заново."}
          </p>
          <Button asChild variant="outline">
            <Link href={`/requests/new?type=${r.type.code}` as Route}>Подать заново</Link>
          </Button>
        </div>
      ) : null}

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
