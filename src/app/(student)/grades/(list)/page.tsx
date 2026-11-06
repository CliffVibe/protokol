import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { DisciplineRow } from "@/components/grades/discipline-row";
import { SemesterTabs } from "@/components/grades/semester-tabs";
import { GradesSummary } from "@/components/grades/summary";
import { parseSemesterParam } from "@/lib/grades-params";
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
  const session = sessionSummary(
    grades.filter((g) => g.semester === current),
    now,
  );

  // ≥ 1024: слева семестры и дисциплины, справа «Как у меня дела» (sticky), как «Изменения недели».
  // В DOM сводка первая: на телефоне ответ сверху; порядок Tab — решение человека 06.11 (как в T05/T06).
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Учёба" />
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start lg:gap-x-12">
        <div className="lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1">
          <GradesSummary summary={summary} session={session} debts={debts} now={now} />
        </div>
        <section
          aria-labelledby="semester-title"
          className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-1"
        >
          <SemesterTabs semesters={semesters} selected={selected} current={current} />
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="semester-title" className="text-xl">
              {selected}-й семестр
              <span className="font-sans text-base font-normal text-ink-muted">
                {isCurrent ? ", текущий" : ", закрыт"}
              </span>
            </h2>
            {/* У текущего семестра средний — крупно в «Как у меня дела»; здесь — только у закрытых */}
            {average !== null && !isCurrent ? (
              <p className="text-sm text-ink-muted">
                Средний рейтинг: <span className="font-bold text-ink tabular">{average}</span> из
                100
              </p>
            ) : null}
          </div>
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
        </section>
      </div>
    </div>
  );
}
