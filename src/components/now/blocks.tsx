import Link from "next/link";
import { Pin } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { formatRelativeDay, formatTime } from "@/lib/dates";
import type { StudySummary } from "@/server/services/academics";
import type { FeedRequest, NowFeed, SoonItem } from "@/server/services/now";
import type { LessonRow } from "@/server/repos/schedule";
import { FeedList, FeedSection } from "./feed-section";
import { CHANGE, requestStatus } from "./labels";

const when = (d: Date, now: Date) => `${formatRelativeDay(d, now)}, ${formatTime(d)}`;

export function ChangesBlock({ changes, now }: { changes: LessonRow[]; now: Date }) {
  if (!changes.length) return null;
  return (
    <FeedSection
      id="changes-title"
      title="Изменения"
      link={{ href: "/schedule", label: "Расписание" }}
    >
      <FeedList label="Изменения в расписании на сегодня и завтра">
        {changes.map((l) => {
          const c = CHANGE[l.change as keyof typeof CHANGE];
          return (
            <li key={l.id} className="flex flex-col gap-1 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <StatusChip tone={c.tone}>{c.label}</StatusChip>
                <span
                  className={l.change === "CANCELLED" ? "text-ink-muted line-through" : "text-ink"}
                >
                  {when(l.startsAt, now)}
                </span>
              </div>
              <p className="font-bold text-ink">{l.discipline.name}</p>
              <p className="text-sm text-ink-muted">
                {l.change === "MOVED" && l.originalStartsAt
                  ? `Было ${formatTime(l.originalStartsAt)}. `
                  : null}
                {l.change === "CANCELLED" ? null : `Ауд. ${l.room}, ${l.building}.`}
                {l.changeNote ? ` ${l.changeNote}` : null}
              </p>
            </li>
          );
        })}
      </FeedList>
    </FeedSection>
  );
}

export function SoonBlock({ soon, now }: { soon: SoonItem[]; now: Date }) {
  return (
    <FeedSection
      id="soon-title"
      title="Скоро"
      link={{ href: "/notifications", label: "Все напоминания" }}
    >
      {soon.length ? (
        <FeedList label="Ближайшие дедлайны и экзамены">
          {soon.map((s) => (
            <li key={s.id} className="flex flex-col gap-0.5 py-3">
              <p className="text-sm text-ink-muted">
                {s.kind === "exam" ? "Экзамен" : "Дедлайн"}, {when(s.at, now)}
              </p>
              <p className="font-bold text-ink">{s.title}</p>
            </li>
          ))}
        </FeedList>
      ) : (
        <p className="border-t border-line pt-3 text-base text-ink-muted">
          Ближайших дедлайнов и экзаменов нет.
        </p>
      )}
    </FeedSection>
  );
}

export function RequestsBlock({ requests, now }: { requests: FeedRequest[]; now: Date }) {
  return (
    <FeedSection
      id="requests-title"
      title="Мои заявки"
      link={{ href: "/requests", label: "Все заявки" }}
    >
      {requests.length ? (
        <FeedList label="Активные заявки">
          {requests.map((r) => {
            const s = requestStatus(r.status);
            return (
              <li key={r.number} className="flex flex-col gap-1 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <StatusChip tone={s.tone}>{s.label}</StatusChip>
                  <span className="text-sm text-ink-muted tabular">{r.number}</span>
                </div>
                <p className="font-bold text-ink">{r.type.title}</p>
                <p className="text-sm text-ink-muted">
                  {r.status === "READY"
                    ? "Можно забрать в деканате."
                    : `Ожидаемый срок: ${formatRelativeDay(r.dueAt, now)}`}
                </p>
              </li>
            );
          })}
        </FeedList>
      ) : (
        <EmptyState
          headingLevel={3}
          stampPlace
          title="Заявок пока нет"
          description="Справку можно заказать онлайн — статус будет виден здесь."
          action={
            <Button asChild variant="outline">
              <Link href="/requests">Заказать справку</Link>
            </Button>
          }
        />
      )}
    </FeedSection>
  );
}

export function AnnouncementsBlock({
  announcements,
  now,
}: {
  announcements: NowFeed["announcements"];
  now: Date;
}) {
  return (
    <FeedSection
      id="announcements-title"
      title="Объявления"
      link={{ href: "/notifications", label: "Все объявления" }}
    >
      {announcements.length ? (
        <FeedList label="Объявления деканата">
          {announcements.map((a) => (
            <li key={a.id} className="flex flex-col gap-1 py-3">
              <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
                {a.pinned ? (
                  <span className="inline-flex items-center gap-1 font-bold text-brand">
                    <Pin aria-hidden className="size-4" />
                    Закреплено
                  </span>
                ) : null}
                <span>{formatRelativeDay(a.publishedAt, now)}</span>
              </p>
              <p className="font-bold text-ink">{a.title}</p>
              {/* Текст объявления — простой текст: React экранирует, markdown здесь не рендерим (S5) */}
              <p className="line-clamp-2 text-sm text-ink-muted">{a.body}</p>
            </li>
          ))}
        </FeedList>
      ) : (
        <p className="border-t border-line pt-3 text-base text-ink-muted">Новых объявлений нет.</p>
      )}
    </FeedSection>
  );
}

export function StudyBlock({ study }: { study: StudySummary | null }) {
  return (
    <FeedSection id="study-title" title="Учёба" link={{ href: "/grades", label: "Успеваемость" }}>
      {study ? (
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          <p className="text-base text-ink">
            {study.averageRating !== null ? (
              <>
                Средний рейтинг за {study.semester}-й семестр:{" "}
                <span className="font-heading text-2xl font-bold tabular">
                  {study.averageRating}
                </span>{" "}
                из 100
              </>
            ) : (
              `${study.semester}-й семестр: баллов пока нет`
            )}
          </p>
          {study.scholarship.kept ? (
            <StatusChip tone="ok" className="self-start">
              Стипендия сохраняется
            </StatusChip>
          ) : (
            <div className="flex flex-col gap-1.5">
              <StatusChip tone="warn" className="self-start">
                Стипендия под угрозой
              </StatusChip>
              <ul aria-label="Причины" className="list-disc pl-5 text-sm text-ink">
                {study.scholarship.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <p className="border-t border-line pt-3 text-base text-ink-muted">
          Оценок пока нет — рейтинг появится после первых занятий с баллами.
        </p>
      )}
    </FeedSection>
  );
}
