import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AlarmClock, BookOpenCheck, ShieldX } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { OfferedMark } from "@/components/staff/offered-mark";
import { requestStatus } from "@/components/now/labels";
import { STAFF_READY_LABEL } from "@/components/staff/labels";
import { RequestTimeline } from "@/components/requests/timeline";
import { MakeAnswerButton } from "@/components/staff/make-answer-button";
import { RevokeDocument } from "@/components/staff/revoke-document";
import { StatusActions } from "@/components/staff/status-actions";
import { StatusChip } from "@/components/status-chip";
import { formatDayMonth, formatRelativeDay, plural } from "@/lib/dates";
import { requireStaff } from "@/server/auth/guards";
import { LANGUAGE_LABEL, overdueDays, requestNumberSchema } from "@/server/services/request-rules";
import { getStaffRequest } from "@/server/services/requests";

// Карточка заявки для сотрудника (T08). Только своего факультета (репозиторий, S1): чужая → 404.
// Своего loading.tsx нет: проверка — до начала стрима, статус 404 настоящий (как у студента).
// Данные студента — только нужные для справки: ФИО, группа, курс, факультет.
const load = cache(async (raw: string) => {
  const ctx = await requireStaff();
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const number = requestNumberSchema.safeParse(decoded);
  if (!number.success) return null;
  return getStaffRequest(ctx, number.data);
});

export async function generateMetadata({
  params,
}: PageProps<"/staff/requests/[number]">): Promise<Metadata> {
  const r = await load((await params).number);
  return { title: r ? `№ ${r.number}` : "Заявка не найдена" };
}

export default async function StaffRequestPage({ params }: PageProps<"/staff/requests/[number]">) {
  await requireStaff();
  const r = await load((await params).number);
  if (!r) notFound();
  const now = new Date();
  const base = requestStatus(r.status);
  // «Готова — заберите» — для студента; сотруднику — «Готова к выдаче» (ux-reviewer, T08)
  const status = r.status === "READY" ? { ...base, label: STAFF_READY_LABEL } : base;
  const s = r.student;
  const overdue = overdueDays({ ...r, slaDays: r.type.slaDays }, now);
  // Кто сделал шаг: сотрудник — по ФИО, студент — «студент»
  const actors = Object.fromEntries(
    r.events.map((e) => [e.status, e.actor.staff?.fullName ?? "студент"]),
  );
  // T14+: ответ сотрудника студенту по существу (не причина отказа — она про конкретного студента)
  const staffAnswered = r.events.some(
    (e) => e.comment && e.status !== "REJECTED" && e.actor.role === "STAFF",
  );

  return (
    <div className="flex flex-col gap-8 lg:max-w-3xl">
      <PageHeader
        title={r.type.title}
        back={{ href: "/staff", label: "Очередь" }}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="tabular">
              №&nbsp;{r.number}, подана {formatRelativeDay(r.createdAt, now)}
            </span>
            {r.offered ? <OfferedMark /> : null}
          </span>
        }
      />

      <section aria-labelledby="status-title" className="flex flex-col gap-3">
        <h2 id="status-title" className="text-lg">
          Статус
        </h2>
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <StatusChip tone={status.tone}>{status.label}</StatusChip>
          {overdue > 0 ? (
            <StatusChip tone="danger" icon={AlarmClock}>
              Просрочена на {overdue} {plural(overdue, ["день", "дня", "дней"])}
            </StatusChip>
          ) : r.timeline.dueAt ? (
            <span className="text-base text-ink">
              Срок — {formatRelativeDay(r.timeline.dueAt, now)}
            </span>
          ) : null}
        </div>
        {r.next.length ? <StatusActions number={r.number} from={r.status} next={r.next} /> : null}
      </section>

      {r.document ? (
        <section aria-labelledby="document-title" className="flex flex-col gap-3">
          <h2 id="document-title" className="text-lg">
            Справка
          </h2>
          <div className="flex flex-col gap-3 border-t border-line pt-4">
            {r.document.revoked ? (
              <div className="flex gap-2.5 border-l-2 border-danger py-1 pl-3">
                <ShieldX aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
                <div className="flex flex-col gap-0.5">
                  <p className="text-base font-bold text-ink">
                    Отозвана
                    {r.document.revokedAt ? ` ${formatRelativeDay(r.document.revokedAt, now)}` : ""}
                  </p>
                  {r.document.revokedReason ? (
                    <p className="text-sm break-words text-ink-muted">
                      Причина: {r.document.revokedReason}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              // Документ создаётся на «Готова»: до выдачи на руки он «оформлен», а не «выдан» (ux-reviewer, T10)
              <p className="text-base text-ink">
                {r.status === "ISSUED" ? "Выдана" : "Оформлена"}{" "}
                {formatRelativeDay(r.document.issuedAt, now)}
                {r.document.validUntil
                  ? `, действует до ${formatDayMonth(r.document.validUntil)}`
                  : ""}
                . Студент {r.status === "ISSUED" ? "может" : "уже может"} скачать её с QR-кодом
                проверки.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={`/verify/${r.document.verifyToken}`}
                className="-ml-2 inline-flex min-h-[44px] items-center rounded-lg px-2 text-base text-brand hover:underline"
              >
                Открыть страницу проверки
              </a>
              {r.document.revoked ? null : <RevokeDocument number={r.number} />}
            </div>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="student-title" className="flex flex-col gap-3">
        <h2 id="student-title" className="text-lg">
          Студент
        </h2>
        <dl className="flex flex-col gap-3 border-t border-line pt-4 text-base">
          <Fact term="ФИО">
            {s.lastName} {s.firstName} {s.middleName ?? ""}
          </Fact>
          <Fact term="Группа">
            {s.group.name}, {s.group.course}-й курс
          </Fact>
          <Fact term="Факультет">{s.group.program.faculty.name}</Fact>
        </dl>
      </section>

      <section aria-labelledby="given-title" className="flex flex-col gap-3">
        <h2 id="given-title" className="text-lg">
          Что указал студент
        </h2>
        <dl className="flex flex-col gap-3 border-t border-line pt-4 text-base">
          <Fact term="Язык справки">{LANGUAGE_LABEL[r.language] ?? r.language}</Fact>
          {r.fields.map((f) => (
            <Fact key={f.label} term={f.label}>
              {f.value}
            </Fact>
          ))}
        </dl>
      </section>

      <section aria-labelledby="history-title" className="flex flex-col gap-3">
        <h2 id="history-title" className="text-lg">
          История
        </h2>
        <div className="border-t border-line pt-4">
          <RequestTimeline timeline={r.timeline} now={now} actors={actors} />
        </div>
      </section>

      {staffAnswered || r.faqEntry ? (
        // T14+, база знаний: ответ одному студенту → ответ помощника всем (после проверки человеком)
        <section aria-labelledby="kb-title" className="flex flex-col gap-3">
          <h2 id="kb-title" className="text-lg">
            Ответ помощника
          </h2>
          <div className="flex flex-col items-start gap-3 border-t border-line pt-4">
            {r.faqEntry ? (
              <p className="flex items-start gap-2 text-base text-ink">
                <BookOpenCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-brand" />
                <span>
                  Из ответа на эту заявку уже сделан ответ помощника —{" "}
                  {r.faqEntry.published ? "опубликован" : "черновик ждёт проверки"}.{" "}
                  <Link
                    href={`/staff/answers/${r.faqEntry.id}` as Route}
                    className="font-bold text-brand underline-offset-4 hover:underline"
                  >
                    Открыть ответ помощника
                  </Link>
                </span>
              </p>
            ) : (
              <>
                <p className="text-base text-ink">
                  Если ваш ответ пригодится и другим студентам, сделайте из него ответ помощника.
                  Имя студента, номера и контакты уберём сами, а перед публикацией вы проверите
                  текст.
                </p>
                <MakeAnswerButton number={r.number} />
              </>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:grid sm:grid-cols-[10rem_1fr] sm:gap-x-6">
      <dt className="text-sm text-ink-muted sm:pt-0.5">{term}</dt>
      <dd className="break-words text-ink">{children}</dd>
    </div>
  );
}
