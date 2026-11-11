import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { BookOpenCheck, PencilLine } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { formatRelativeDay } from "@/lib/dates";
import { requireStaff } from "@/server/auth/guards";
import { listFaqEntries } from "@/server/services/faq-entries";

export const metadata: Metadata = { title: "Ответы помощника" };

// База знаний из заявок (T14+): ответы деканата, по которым ИИ-помощник отвечает студентам. Делаются из
// ответов сотрудника на заявки («Сделать ответом помощника» в карточке): личное убирает сервер, публикует
// человек. Только записи своих факультетов (репозиторий, S1). requireStaff() — первой строкой.

type Entry = Awaited<ReturnType<typeof listFaqEntries>>[number];

export default async function StaffAnswersPage() {
  const ctx = await requireStaff();
  const entries = await listFaqEntries(ctx);
  const now = new Date();
  const drafts = entries.filter((e) => !e.published);
  const published = entries.filter((e) => e.published);

  return (
    <div className="flex flex-col gap-8 lg:max-w-3xl">
      <PageHeader
        title="База ответов помощника"
        description="По этим ответам деканата ИИ-помощник отвечает студентам. Их делают из ваших ответов на заявки: имя студента и номера убираем, публикуете вы."
      />
      {entries.length ? (
        <>
          <EntryList
            id="drafts"
            title="Ждут проверки"
            entries={drafts}
            now={now}
            empty="Черновиков нет — всё проверено."
          />
          <EntryList
            id="published"
            title="Опубликованы"
            entries={published}
            now={now}
            empty="Пока ничего не опубликовано."
          />
        </>
      ) : (
        <EmptyState
          title="Ответов пока нет"
          description="Откройте заявку, где вы ответили студенту по существу, и внизу карточки нажмите «Сделать ответом помощника»."
          action={
            <Button asChild variant="outline">
              <Link href={"/staff?status=closed" as Route}>Закрытые заявки</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}

function EntryList({
  id,
  title,
  entries,
  now,
  empty,
}: {
  id: string;
  title: string;
  entries: Entry[];
  now: Date;
  empty: string;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3">
      <h2 id={`${id}-title`} className="text-lg">
        {title}
      </h2>
      {entries.length ? (
        <ul className="flex flex-col divide-y divide-line border-y border-line">
          {entries.map((e) => (
            <li key={e.id} className="relative flex items-start gap-2.5 py-3">
              {e.published ? (
                <BookOpenCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-brand" />
              ) : (
                <PencilLine aria-hidden className="mt-0.5 size-5 shrink-0 text-warn" />
              )}
              <div className="flex min-w-0 flex-col gap-0.5">
                <Link
                  href={`/staff/answers/${e.id}` as Route}
                  className="self-start text-base font-bold break-words text-ink outline-none after:absolute after:inset-0 after:rounded-sm hover:underline focus-visible:after:outline-2 focus-visible:after:outline-solid focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring"
                >
                  {e.title}
                </Link>
                <p className="text-sm text-ink-muted">
                  {e.published && e.publishedAt
                    ? `Опубликован ${formatRelativeDay(e.publishedAt, now)}`
                    : `Черновик, изменён ${formatRelativeDay(e.updatedAt, now)}`}
                  , {e.faculty.code}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-y border-line py-3 text-base text-ink-muted">{empty}</p>
      )}
    </section>
  );
}
