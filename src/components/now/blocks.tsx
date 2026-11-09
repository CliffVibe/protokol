import type { Route } from "next";
import Link from "next/link";
import { Pin, ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { StatusChip } from "@/components/status-chip";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatDayAndMonth, formatRelativeDay, formatTime, formatWas } from "@/lib/dates";
import type { StudySummary } from "@/server/services/academics";
import { ScholarshipBadge } from "@/components/grades/scholarship-badge";
import type { FeedRequest, NowFeed, SoonItem } from "@/server/services/now";
import type { LessonRow } from "@/server/repos/schedule";
import { FeedList, FeedSection } from "./feed-section";
import { CHANGE, requestStatus } from "./labels";
import { markdownToPlain } from "@/lib/markdown";
import { requestHref } from "@/server/services/request-rules";

const when = (d: Date, now: Date) => `${formatRelativeDay(d, now)}, ${formatTime(d)}`;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function ChangesBlock({ changes, now }: { changes: LessonRow[]; now: Date }) {
  if (!changes.length) return null;
  return (
    <FeedSection
      id="changes-title"
      title="Изменения"
      link={{ href: "/schedule", label: "Всё расписание" }}
    >
      <FeedList label="Изменения в расписании на сегодня и завтра">
        {changes.map((l) => {
          const c = CHANGE[l.change as keyof typeof CHANGE];
          return (
            <li
              key={l.id}
              // Б′: статус — иконка + цветной текст + черта в поле страницы слева (как в расписании), без чипа
              className={cn(
                "relative flex flex-col gap-1 py-3 before:absolute before:inset-y-3 before:left-[-10px] before:w-[4px] before:rounded-full",
                l.change === "CANCELLED" ? "before:bg-danger" : "before:bg-warn",
              )}
            >
              <p
                className={cn(
                  "flex flex-wrap items-center gap-x-1.5 text-sm font-bold",
                  c.tone === "danger" ? "text-danger" : "text-warn",
                )}
              >
                <c.icon aria-hidden className="size-4 shrink-0" />
                {/* Отступ даёт gap-x: лишний пробел давал двойной (ux-reviewer, T13) */}
                {c.label},
                <span className={l.change === "CANCELLED" ? "line-through" : undefined}>
                  {when(l.startsAt, now)}
                </span>
              </p>
              <p className="font-bold text-ink">{l.discipline.name}</p>
              <p className="text-sm text-ink-muted">
                {l.change === "MOVED" && l.originalStartsAt
                  ? `${capitalize(formatWas(l.originalStartsAt, l.startsAt, now))}. `
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

export function SoonBlock({
  soon,
  now,
  deadlinesFailed,
}: {
  soon: SoonItem[];
  now: Date;
  deadlinesFailed: boolean;
}) {
  return (
    <FeedSection
      id="soon-title"
      title="Скоро"
      link={{ href: "/notifications", label: "Все напоминания" }}
    >
      {soon.length ? (
        <FeedList label="Ближайшие дедлайны и экзамены">
          {soon.map((s) => (
            <li key={s.id} className="flex gap-3 py-3">
              {/* Дата крупно столбцом — для глаза; полностью она прочитается строкой ниже */}
              {/* Б′: синий — только у ссылок, поэтому дата чернилами; акцент держит Unbounded */}
              <p aria-hidden className="flex w-10 shrink-0 flex-col pt-0.5 text-ink">
                <span className="font-heading text-xl leading-none font-semibold tabular">
                  {formatDayAndMonth(s.at).day}
                </span>
                <span className="mt-1 text-xs font-semibold">{formatDayAndMonth(s.at).month}</span>
              </p>
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="font-bold break-words text-ink">{s.title}</p>
                <p className="text-sm text-ink-muted">
                  {s.kind === "exam" ? "Экзамен" : "Дедлайн"}, {when(s.at, now)}
                </p>
              </div>
            </li>
          ))}
        </FeedList>
      ) : (
        <p className="border-t border-line pt-3 text-base text-ink-muted">
          {deadlinesFailed
            ? "Дедлайны не загрузились — обновите страницу чуть позже."
            : "Ближайших дедлайнов и экзаменов нет."}
        </p>
      )}
      {deadlinesFailed && soon.length ? (
        <p className="text-sm text-ink-muted">
          Дедлайны не загрузились — показаны только экзамены.
        </p>
      ) : null}
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
              // Строка — ссылка целиком (как в списке заявок T08): мятный «Готова — заберите» похож на кнопку,
              // касание по нему должно вести к заявке и PDF (ux-reviewer, T13)
              <li key={r.number} className="relative flex flex-col gap-1 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <StatusChip tone={s.tone}>{s.label}</StatusChip>
                  <span className="text-sm text-ink-muted tabular">{r.number}</span>
                </div>
                <Link
                  href={requestHref(r.number) as Route}
                  className="self-start font-bold break-words text-ink outline-none after:absolute after:inset-0 after:rounded-sm hover:underline focus-visible:after:outline-2 focus-visible:after:outline-solid focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring"
                >
                  {r.type.title}
                </Link>
                <p className="text-sm text-ink-muted">
                  {r.status === "READY"
                    ? "Заберите в деканате своего факультета: пн–пт, с 10:00 до 17:00."
                    : r.dueAt < now
                      ? `Срок прошёл: ${formatRelativeDay(r.dueAt, now)}. Деканат уже видит заявку`
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
  /** null — объявления не загрузились */
  announcements: NowFeed["announcements"];
  now: Date;
}) {
  return (
    <FeedSection
      id="announcements-title"
      title="Объявления"
      link={{ href: "/notifications?tab=announcements", label: "Все объявления" }}
    >
      {announcements === null ? (
        <p className="border-t border-line pt-3 text-base text-ink-muted">
          Объявления не загрузились — обновите страницу чуть позже.
        </p>
      ) : announcements.length ? (
        <FeedList label="Объявления деканата">
          {announcements.map((a) => (
            <li key={a.id} className="flex flex-col gap-1 py-3">
              <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
                {a.pinned ? (
                  <span className="inline-flex items-center gap-1 font-bold text-ink">
                    <Pin aria-hidden className="size-4" />
                    Закреплено
                  </span>
                ) : null}
                <span>{formatRelativeDay(a.publishedAt, now)}</span>
              </p>
              <p className="font-bold text-ink">{a.title}</p>
              {/* Здесь — простой текст без разметки (полный текст с разметкой — на доске объявлений, T09) */}
              <p className="line-clamp-2 text-sm text-ink-muted">{markdownToPlain(a.body)}</p>
            </li>
          ))}
        </FeedList>
      ) : (
        <p className="border-t border-line pt-3 text-base text-ink-muted">Новых объявлений нет.</p>
      )}
    </FeedSection>
  );
}

export function StudyBlock({
  study,
  id = "study-title",
  className,
}: {
  study: StudySummary | null;
  /** На «Сейчас» блок стоит дважды (телефон — в ленте, десктоп — в правой колонке): id должны различаться */
  id?: string;
  className?: string;
}) {
  return (
    <FeedSection
      id={id}
      title="Учёба"
      link={{ href: "/grades", label: "Успеваемость" }}
      className={className}
    >
      {study && study.averageRating !== null && study.scholarship.kept ? (
        // Всё хорошо — мятный блок (Б′): мята только для «хорошо и готово», поэтому при угрозе его нет
        <div className="flex flex-col gap-1 rounded-[1.75rem] bg-mint p-5 text-on-mint">
          <p className="text-base font-semibold">Средний рейтинг, {study.semester}-й семестр</p>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-heading text-4xl font-semibold tracking-tight tabular">
              {study.averageRating}
            </span>
            <span className="text-base">из 100</span>
          </p>
          {/* Строка «значок + текст», без пилюли внутри мятного блока: при 200% пилюля рвала слова по слогам */}
          <p className="mt-2 flex items-start gap-2 text-base font-semibold">
            <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0" />
            <span className="min-w-0 break-words">Стипендия сохраняется</span>
          </p>
        </div>
      ) : study ? (
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          <p className="text-base text-ink">
            {study.averageRating !== null ? (
              <>
                Средний рейтинг за {study.semester}-й семестр:{" "}
                {/* «66 из 100» — одним куском: на 360 «100» уезжала на строку ниже */}
                <span className="whitespace-nowrap">
                  <span className="font-heading text-2xl font-semibold tabular">
                    {study.averageRating}
                  </span>
                  &nbsp;из 100
                </span>
              </>
            ) : (
              `${study.semester}-й семестр: баллов пока нет`
            )}
          </p>
          <ScholarshipBadge scholarship={study.scholarship} />
        </div>
      ) : (
        <p className="border-t border-line pt-3 text-base text-ink-muted">
          Оценок пока нет — рейтинг появится после первых занятий с баллами.
        </p>
      )}
    </FeedSection>
  );
}
