import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";
import { FilePen } from "lucide-react";
import { StatusChip } from "@/components/status-chip";
import { PageHeader } from "@/components/page-header";
import { missingText } from "@/components/grades/discipline-row";
import { ASSESSMENT_KIND, gradeChip, resultLabel } from "@/components/grades/labels";
import { RatingBar } from "@/components/grades/rating-bar";
import { formatDayMonth, formatInDays, formatTime, plural } from "@/lib/dates";
import { mskStartOfDay } from "@/lib/msk";
import { disciplineIdSchema } from "@/lib/grades-params";
import { RETAKE_TYPE, wizardHref } from "@/lib/request-wizard";
import { Button } from "@/components/ui/button";
import { requireStudent } from "@/server/auth/guards";
import type { DisciplineGrade } from "@/server/repos/grades";
import { isDebt, pointsToThreshold } from "@/server/services/academics";
import { getDisciplineDetails } from "@/server/services/grades";

// Детали дисциплины (T07). id из адреса — только формат через zod; чья дисциплина — решает репозиторий
// (WHERE studentId = ctx.studentId, S1). Нет у студента → 404, а не 403: не подтверждаем существование.
// Общая дисциплина (английский) — каждому только его баллы.
// Своего loading.tsx нет намеренно: проверка владельца идёт до начала стрима, и чужой id получает
// настоящий HTTP 404, а не 200 со страницей «не найдено» (loading.md → «Status codes»).
// Один загрузчик на запрос (cache) — и для <title>, и для страницы: чужое название не утечёт и в заголовок.
const load = cache(async (rawId: string) => {
  const ctx = await requireStudent();
  const id = disciplineIdSchema.safeParse(rawId);
  if (!id.success) return null;
  return getDisciplineDetails(ctx, id.data);
});

export async function generateMetadata({
  params,
}: PageProps<"/grades/[disciplineId]">): Promise<Metadata> {
  const details = await load((await params).disciplineId);
  return { title: details ? details.rows[0]!.discipline.name : "Дисциплина не найдена" };
}

export default async function DisciplinePage({ params }: PageProps<"/grades/[disciplineId]">) {
  await requireStudent();
  const details = await load((await params).disciplineId);
  if (!details) notFound();
  const { rows, currentSemester } = details;
  const discipline = rows[0]!.discipline;
  const now = new Date();

  return (
    <div className="flex flex-col gap-8 lg:max-w-3xl">
      <PageHeader
        title={discipline.name}
        back={{ href: "/grades", label: "Учёба" }}
        description={`${discipline.credits} ${plural(discipline.credits, ["зачётная единица", "зачётные единицы", "зачётных единиц"])}`}
      />
      {rows.map((g) => (
        <SemesterBlock
          key={g.semester}
          grade={g}
          isCurrent={g.semester === currentSemester}
          now={now}
        />
      ))}
    </div>
  );
}

function SemesterBlock({
  grade,
  isCurrent,
  now,
}: {
  grade: DisciplineGrade;
  isCurrent: boolean;
  now: Date;
}) {
  const chip = gradeChip(grade, isCurrent);
  const missing = isCurrent ? pointsToThreshold(grade.ratingPoints) : 0;
  const titleId = `sem-${grade.semester}`;
  const days = grade.examDate
    ? Math.round((+mskStartOfDay(grade.examDate) - +mskStartOfDay(now)) / 86_400_000)
    : null;
  return (
    <section
      id={titleId}
      aria-labelledby={`${titleId}-title`}
      className="flex scroll-mt-6 flex-col gap-3"
    >
      <h2 id={`${titleId}-title`} className="text-xl">
        {grade.semester}-й семестр
        <span className="font-sans text-base font-normal text-ink-muted">
          {isCurrent ? ", текущий" : ", закрыт"}
        </span>
      </h2>
      <div className="flex flex-col gap-4 border-t border-line pt-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-base text-ink-muted tabular">
            <span className="font-heading text-3xl font-bold text-ink">
              {grade.ratingPoints ?? "—"}
            </span>
            {grade.ratingPoints !== null ? " из 100" : " баллов пока нет"}
            <span className="sr-only"> — рейтинг</span>
          </p>
          <StatusChip tone={chip.tone} icon={chip.icon}>
            {chip.label}
          </StatusChip>
        </div>
        <RatingBar value={grade.ratingPoints} tone={chip.tone} />

        {missing > 0 ? (
          <p className="text-base text-ink">
            <span className="font-bold">{missingText(missing)}.</span> Для стипендии нужен рейтинг
            не ниже 60 по каждой дисциплине текущего семестра.
          </p>
        ) : null}
        {isDebt(grade) ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-base text-ink">
              <span className="font-bold">
                Из-за долга стипендия под угрозой, пока он не закрыт.
              </span>{" "}
              Пересдачу назначает деканат по заявлению — дисциплина в нём уже будет указана.
            </p>
            {/* T13: из долга — сразу к заявлению. В адресе только id; название подставит сервер,
                найдя дисциплину у этого студента. Outline: заливной кнопки на экране нет */}
            <Button asChild variant="outline" className="h-auto min-h-11 py-2 whitespace-normal">
              <Link href={wizardHref({ type: RETAKE_TYPE, discipline: grade.discipline.id })}>
                <FilePen aria-hidden data-icon="inline-start" />
                Подать заявление на пересдачу
              </Link>
            </Button>
          </div>
        ) : null}

        <dl className="flex flex-col gap-3 text-base">
          <Fact term="Форма контроля">{ASSESSMENT_KIND[grade.kind]}</Fact>
          <Fact term="Дата">
            {grade.examDate ? (
              <>
                {formatDayMonth(grade.examDate)}, {formatTime(grade.examDate)}
                {days !== null && days >= 0 && !resultLabel(grade) ? (
                  <span className="font-bold"> — {formatInDays(days)}</span>
                ) : null}
              </>
            ) : (
              <span className="text-ink-muted">Пока не назначена</span>
            )}
          </Fact>
          <Fact term="Преподаватель">{grade.teacher?.fullName ?? "—"}</Fact>
          <Fact term="Итог">
            {resultLabel(grade) ?? <span className="text-ink-muted">Будет после сессии</span>}
          </Fact>
        </dl>
      </div>
    </section>
  );
}

/** Пара «подпись — значение»: на телефоне подпись над значением, с 640px — в две колонки. */
function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:grid sm:grid-cols-[10rem_1fr] sm:gap-x-6">
      <dt className="text-sm text-ink-muted sm:pt-0.5">{term}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}
