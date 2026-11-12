// «Как у меня дела» (T07): средний рейтинг текущего семестра, долги, стипендия, сессия.
// Всегда про текущий семестр — переключатель семестров меняет только список ниже.
import Link from "next/link";
import type { Route } from "next";
import { CircleCheck, CircleX } from "lucide-react";
import { formatDayMonth, formatDayRange, formatInDays, formatTime, plural } from "@/lib/dates";
import type { GradeRow, SessionSummary, StudySummary } from "@/server/services/academics";
import { ASSESSMENT_KIND, ASSESSMENT_PLURAL, resultLabel } from "./labels";
import { disciplineHref } from "./discipline-row";
import { ScholarshipBadge } from "./scholarship-badge";

export function GradesSummary({
  summary,
  session,
  debts,
  now,
  whatIf,
}: {
  summary: StudySummary;
  session: SessionSummary | null;
  debts: GradeRow[];
  now: Date;
  /** Есть дисциплины без итога — ведём к «Что если…» (T11) */
  whatIf: boolean;
}) {
  return (
    <section aria-labelledby="how-title" className="flex min-w-0 flex-col gap-3">
      <h2 id="how-title" className="text-lg">
        Как у меня дела
      </h2>
      <div className="flex flex-col gap-4 border-t border-line pt-3">
        <p className="text-base text-ink">
          {summary.averageRating !== null ? (
            <>
              Средний рейтинг за {summary.semester}-й семестр:{" "}
              {/* «82 из 100» — одним куском: «100» уезжала на строку ниже (ux-reviewer, T13) */}
              <span className="whitespace-nowrap">
                <span className="font-heading text-2xl font-semibold tabular">
                  {summary.averageRating}
                </span>
                &nbsp;из 100
              </span>
            </>
          ) : (
            `${summary.semester}-й семестр: баллов пока нет`
          )}
        </p>

        {debts.length ? (
          <div className="flex flex-col gap-1.5">
            <p className="flex items-center gap-1.5 font-bold text-danger">
              <CircleX aria-hidden className="size-4 shrink-0" />
              {debts.length}
              {" "}
              {plural(debts.length, ["долг", "долга", "долгов"])}
            </p>
            <ul aria-label="Долги" className="flex flex-col gap-1">
              {debts.map((g) => (
                <li key={`${g.discipline.id}-${g.semester}`} className="flex flex-col">
                  <Link
                    // Сразу к семестру с долгом: первым в деталях стоит текущий, и без якоря
                    // человек видел бы зелёное «В норме» (ux-reviewer, T07)
                    href={disciplineHref(g.discipline.id, g.semester)}
                    className="inline-flex min-h-11 items-center self-start text-base font-bold text-brand underline-offset-4 hover:underline"
                  >
                    Долг: {g.discipline.name}
                  </Link>
                  <span className="text-sm text-ink-muted">
                    {g.semester}-й семестр, {resultLabel(g)?.toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-base text-ink">
            <CircleCheck aria-hidden className="size-4 shrink-0 text-ok" />
            Долгов нет
          </p>
        )}

        <div className="flex flex-col gap-1">
          <ScholarshipBadge scholarship={summary.scholarship} debtsShownAbove={debts.length > 0} />
          {whatIf ? (
            // С закрытого семестра — тоже: симулятор есть только у текущего
            <Link
              href={"/grades#what-if" as Route}
              className="inline-flex min-h-[44px] items-center self-start text-base font-bold text-brand underline-offset-4 hover:underline"
            >
              Что если сдать сессию…
            </Link>
          ) : null}
        </div>

        {session ? <SessionLine session={session} now={now} /> : null}
      </div>
    </section>
  );
}

function SessionLine({ session, now }: { session: SessionSummary; now: Date }) {
  const parts = (Object.keys(session.counts) as (keyof typeof session.counts)[])
    .filter((k) => session.counts[k] > 0)
    .map((k) => `${session.counts[k]}\u00a0${plural(session.counts[k], ASSESSMENT_PLURAL[k])}`);
  const dates = session.from && session.to ? formatDayRange(session.from, session.to, now) : null;
  return (
    <div className="flex flex-col gap-1 text-sm text-ink">
      <p>
        {/* «Экзамены и зачёты», а не «сессия»: досрочный экзамен в ноябре — тоже контроль семестра */}
        <span className="font-bold">Экзамены и зачёты{dates ? ` ${dates}` : ""}:</span>{" "}
        {parts.join(", ")}.{dates ? "" : " Даты появятся позже."}
      </p>
      {session.next ? (
        <p>
          Ближайшее — {ASSESSMENT_KIND[session.next.kind].toLowerCase()} «{session.next.name}»,{" "}
          <span className="font-bold">{formatInDays(session.next.inDays)}</span> (
          {formatDayMonth(session.next.at)}, {formatTime(session.next.at)}).
        </p>
      ) : null}
    </div>
  );
}
