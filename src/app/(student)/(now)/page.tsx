import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import {
  AnnouncementsBlock,
  ChangesBlock,
  RequestsBlock,
  SoonBlock,
  StudyBlock,
} from "@/components/now/blocks";
import { NowCard } from "@/components/now/now-card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { formatLongDay, greetingFor } from "@/lib/dates";
import { requireStudent } from "@/server/auth/guards";
import { getNowFeed } from "@/server/services/now";

export const metadata: Metadata = { title: "Сейчас" };

// Главная «Сейчас» (T05, сценарий 1 «Утро»): за 0 касаний — что важно в эту минуту.
// Мобильный: блоки сверху вниз по срочности. Десктоп ≥ 1024: справа колонка «Ближайшее»
// (пара, изменения, скоро). В DOM «Ближайшее» идёт первой — так же читают скринридер и Tab;
// колонку на место ставит сетка, а не CSS order (урок T04, ai-errors.md).
// Доступ — requireStudent() первой строкой, до любых данных (CLAUDE.md → «Железные правила»).
export default async function NowPage() {
  const ctx = await requireStudent();
  const now = new Date();
  const feed = await getNowFeed(ctx, now);
  if (!feed) notFound();

  return (
    <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start lg:gap-x-12 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <PageHeader
        className="lg:col-span-2"
        title={`${greetingFor(now)}, ${feed.firstName}`}
        description={formatLongDay(now)}
      />

      <section
        aria-label="Ближайшее"
        className="flex min-w-0 flex-col gap-8 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-3 lg:row-start-2"
      >
        {feed.next ? (
          <NowCard next={feed.next} now={now} />
        ) : (
          <EmptyState
            title="В ближайшие дни пар нет"
            description="Можно выдохнуть. Следующую неделю смотрите в расписании."
            action={
              <Button asChild variant="outline">
                <Link href="/schedule">Всё расписание</Link>
              </Button>
            }
          />
        )}
        <ChangesBlock changes={feed.changes} now={now} />
        <SoonBlock soon={feed.soon} now={now} deadlinesFailed={feed.deadlinesFailed} />
      </section>

      <RequestsBlock requests={feed.requests} now={now} />
      <AnnouncementsBlock announcements={feed.announcements} now={now} />
      <StudyBlock study={feed.study} />
    </div>
  );
}
