import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { DisciplineRow } from "@/components/grades/discipline-row";
import { SemesterTabs } from "@/components/grades/semester-tabs";
import { GradesSummary } from "@/components/grades/summary";
import { RatingTrend } from "@/components/grades/rating-trend";
import { WhatIf } from "@/components/grades/what-if";
import { parseSemesterParam } from "@/lib/grades-params";
import { isPending } from "@/lib/scholarship";
import { requireStudent } from "@/server/auth/guards";
import { averageRating, sessionSummary, sortForAttention } from "@/server/services/academics";
import { getGradesOverview } from "@/server/services/grades";

export const metadata: Metadata = { title: "Учёба" };

// Успеваемость (T07, сценарий «Как дела с учёбой»): сверху ответ «как у меня дела» (текущий семестр,
// долги, стипендия, сессия), ниже — дисциплины выбранного семестра, проблемные первыми.
// ?semester=N — только свой семестр (zod); битое значение — текущий, не 500.
// Доступ — requireStudent() первой строкой, до любых данных (CLAUDE.md → «Железные правила»).
export default async function GradesPage({ searchParams }: PageProps<"/grades">) {
  const ctx = await requireStudent();
  const { semester } = await searchParams;
  const { grades, summary, semesters, debts } = await getGradesOverview(ctx);
  const now = new Date();

  if (!summary)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Учёба" />
        <EmptyState
          title="Оценок пока нет"
          description="Рейтинг из 100 по каждой дисциплине появится после первых занятий с баллами, а итоги — после сессии. Тогда здесь же будет видно, сохраняется ли стипендия."
        />
      </div>
    );

  const current = summary.semester;
  const selected = parseSemesterParam(semester, semesters) ?? current;
  const isCurrent = selected === current;
  const rows = sortForAttention(
    grades.filter((g) => g.semester === selected),
    isCurrent,
  );
  const average = averageRating(rows);
  // «Что если…» (T11) — только про текущий семестр и только когда есть что «сдать»
  const whatIf = grades.some((g) => g.semester === current && isPending(g));
  const session = sessionSummary(
    grades.filter((g) => g.semester === current),
    now,
  );
  // Динамика: средний рейтинг каждого семестра по возрастанию (у текущего — набирается)
  const trend = [...semesters].reverse().flatMap((s) => {
    const avg = averageRating(grades.filter((g) => g.semester === s));
    return avg === null ? [] : [{ semester: s, average: avg }];
  });

  // ≥ 1024: слева семестры и дисциплины, справа «Как у меня дела» (sticky), как «Изменения недели».
  // В DOM сводка первая: на телефоне ответ сверху; порядок Tab — решение человека 06.11 (как в T05/T06).
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Учёба" />
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start lg:gap-x-12">
        <div className="lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1">
          <GradesSummary
            summary={summary}
            session={session}
            debts={debts}
            now={now}
            whatIf={whatIf}
          />
        </div>
        <section
          aria-labelledby="semester-title"
          className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-1"
        >
          <SemesterTabs semesters={semesters} selected={selected} current={current} />
          {/* Видимый заголовок повторял бы активную вкладку (ux-reviewer, T07) — он для скринридера */}
          <h2 id="semester-title" className="sr-only">
            {selected}-й семестр, {isCurrent ? "текущий" : "закрыт"}
          </h2>
          {/* У текущего семестра средний — крупно в «Как у меня дела»; здесь — только у закрытых */}
          {!isCurrent ? (
            <p className="text-sm text-ink-muted">
              Семестр закрыт.
              {average !== null ? (
                <>
                  {" "}
                  Средний рейтинг: <span className="font-bold text-ink tabular">{average}</span> из
                  100.
                </>
              ) : null}
            </p>
          ) : null}
          {rows.length ? (
            <ul
              aria-label={`Дисциплины, ${selected}-й семестр`}
              className="flex flex-col divide-y divide-line border-y border-line"
            >
              {rows.map((g) => (
                <DisciplineRow key={g.discipline.id} grade={g} isCurrent={isCurrent} />
              ))}
            </ul>
          ) : (
            <p className="border-t border-line pt-3 text-base text-ink-muted">
              В этом семестре оценок нет.
            </p>
          )}
          <RatingTrend points={trend} current={current} />
          {isCurrent && whatIf ? <WhatIf grades={grades} semester={current} /> : null}
        </section>
      </div>
    </div>
  );
}
