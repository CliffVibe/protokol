import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AlarmClock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requestStatus } from "@/components/now/labels";
import { RequestTimeline } from "@/components/requests/timeline";
import { StatusActions } from "@/components/staff/status-actions";
import { StatusChip } from "@/components/status-chip";
import { formatRelativeDay, plural } from "@/lib/dates";
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
  const status = requestStatus(r.status);
  const s = r.student;
  const overdue = overdueDays({ ...r, slaDays: r.type.slaDays }, now);
  // Кто сделал шаг: сотрудник — по ФИО, студент — «студент»
  const actors = Object.fromEntries(
    r.events.map((e) => [e.status, e.actor.staff?.fullName ?? "студент"]),
  );

  return (
    <div className="flex flex-col gap-8 lg:max-w-3xl">
      <PageHeader
        title={r.type.title}
        back={{ href: "/staff", label: "Очередь" }}
        description={
          <span className="tabular">
            № {r.number}, подана {formatRelativeDay(r.createdAt, now)}
          </span>
        }
      />

      <section aria-labelledby="status-title" className="flex flex-col gap-3">
        <h2 id="status-title" className="text-xl">
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

      <section aria-labelledby="student-title" className="flex flex-col gap-3">
        <h2 id="student-title" className="text-xl">
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
        <h2 id="given-title" className="text-xl">
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
        <h2 id="history-title" className="text-xl">
          История
        </h2>
        <div className="border-t border-line pt-4">
          <RequestTimeline timeline={r.timeline} now={now} actors={actors} />
        </div>
      </section>
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
