import { MessageCircleQuestion } from "lucide-react";
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
import { OffersBlock } from "@/components/now/offers-block";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { formatLongDay, greetingFor } from "@/lib/dates";
import { requireStudent } from "@/server/auth/guards";
import { getNowFeed } from "@/server/services/now";

export const metadata: Metadata = { title: "Сейчас" };

// Главная «Сейчас» (T05, сценарий 1 «Утро»): за 0 касаний — что важно в эту минуту.
// Мобильный: блоки сверху вниз по срочности — пара, изменения, скоро, заявки, объявления, учёба
// (учёба — сразу за «Скоро», если стипендия под угрозой или есть долг).
// Десктоп ≥ 1024 (Б′, 10.11): справа колонка «Ближайшее» — плашка пары и мятный блок учёбы,
// слева лента начинается с «Изменений». В DOM «Ближайшее» идёт первой — так же читают скринридер и Tab;
// колонку на место ставит сетка, а не CSS order (урок T04, ai-errors.md). Учёба в DOM дважды:
// в колонке (только ≥ 1024) и в ленте (только < 1024) — второй экземпляр скрыт display:none.
// Доступ — requireStudent() первой строкой, до любых данных (CLAUDE.md → «Железные правила»).
export default async function NowPage() {
  const ctx = await requireStudent();
  const now = new Date();
  const feed = await getNowFeed(ctx, now);
  if (!feed) notFound();
  // Плохая новость не тише хорошей (ревью Б′, T13): при угрозе стипендии или долге «Учёба» в ленте телефона
  // поднимается сразу за «Скоро» — у Тимура она была последней, после объявлений. На ≥ 1024 она и так
  // в колонке «Ближайшее» под плашкой пары.
  const studyAlert = feed.study !== null && (!feed.study.scholarship.kept || feed.study.debts > 0);

  return (
    <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start lg:gap-x-12 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <PageHeader
        className="lg:col-span-2"
        title={`${greetingFor(now)}, ${feed.firstName}`}
        description={formatLongDay(now)}
      />

      <section
        aria-label="Ближайшее"
        className="flex min-w-0 flex-col gap-8 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-2"
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
        <StudyBlock study={feed.study} id="study-title-aside" className="hidden lg:flex" />
      </section>

      <div className="flex min-w-0 flex-col gap-8 lg:col-start-1 lg:row-start-2">
        {/* T14, «Вам положено»: деканат предлагает сам — первым в ленте, пока предложение есть */}
        <OffersBlock offers={feed.offers} />
        <ChangesBlock changes={feed.changes} now={now} />
        <SoonBlock soon={feed.soon} now={now} deadlinesFailed={feed.deadlinesFailed} />
        {studyAlert ? <StudyBlock study={feed.study} className="lg:hidden" /> : null}
        <RequestsBlock requests={feed.requests} now={now} />
        <AnnouncementsBlock announcements={feed.announcements} now={now} />
        {studyAlert ? null : <StudyBlock study={feed.study} className="lg:hidden" />}
      </div>

      {/* Вход в помощника (T12, решение человека 07.11): тихая строка-ссылка, не карточка */}
      <Link
        href="/assistant"
        className="flex min-h-[44px] items-start gap-3 border-t border-line pt-4 text-ink outline-none hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid lg:col-start-1 lg:row-start-3"
      >
        <MessageCircleQuestion aria-hidden className="mt-0.5 size-5 shrink-0 text-brand" />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-base font-bold break-words">Спросить помощника</span>
          <span className="text-sm break-words text-ink-muted">
            Когда экзамен, какая справка нужна, как оформить академ
          </span>
        </span>
      </Link>
    </div>
  );
}
