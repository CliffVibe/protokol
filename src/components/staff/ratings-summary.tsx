import Link from "next/link";
import { MessageSquareQuote, Star, TrendingDown } from "lucide-react";
import { plural } from "@/lib/dates";
import type { RatingsSummary } from "@/server/services/request-rules";

const fmt = (n: number) => n.toFixed(1).replace(".", ",");
/** Отзыв — с точностью до месяца: точный день позволил бы сопоставить отзыв с заявкой (ux-reviewer, T14) */
const MONTH = new Intl.DateTimeFormat("ru-RU", { month: "long", timeZone: "Europe/Moscow" });
/** «в октябре», «в марте», «в мае» — предложный падеж месяца */
function monthOf(d: Date): string {
  const m = MONTH.format(d);
  return `в ${/[ьй]$/.test(m) ? m.slice(0, -1) : m}е`;
}
/** Ниже — «есть над чем поработать»: значок и цвет --warn, не только цвет (Б′) */
const LOW = 3.5;

/**
 * «Что говорят студенты» (T14): оценки решённых заявок своих факультетов — без имён студентов.
 * Хуже по типу — выше; последние отзывы с комментарием; путь к ответу «Вы сказали — мы сделали».
 */
export function RatingsSummaryBlock({ summary }: { summary: RatingsSummary | null }) {
  return (
    <section aria-labelledby="ratings-title" className="flex flex-col gap-3">
      <h2 id="ratings-title" className="text-lg">
        Что говорят студенты
      </h2>
      {summary === null ? (
        // Сводка второстепенна: её сбой не роняет очередь (ux-reviewer, T14)
        <p className="border-t border-line pt-3 text-base text-ink-muted">
          Сводка оценок не загрузилась — обновите страницу чуть позже.
        </p>
      ) : summary.count === 0 || summary.average === null ? (
        <p className="border-t border-line pt-3 text-base text-ink-muted">
          Оценок пока нет — студенты оценивают заявку, когда справка готова.
        </p>
      ) : (
        <div className="flex max-w-3xl flex-col gap-4 border-t border-line pt-3">
          <p className="flex flex-wrap items-baseline gap-x-2 text-base text-ink">
            <Star aria-hidden className="size-4 shrink-0 self-center text-brand" />
            Средняя оценка:
            <span className="font-heading text-2xl font-semibold tabular">
              {fmt(summary.average)}
            </span>
            &nbsp;из 5, {summary.count}&nbsp;
            {plural(summary.count, ["оценка", "оценки", "оценок"])}
            <span className="text-sm text-ink-muted">за всё время, без имён студентов</span>
          </p>
          <ul aria-label="Оценки по типам заявок" className="flex flex-col divide-y divide-line">
            {summary.byType.map((t) => (
              <li key={t.code} className="flex flex-wrap items-center justify-between gap-x-4 py-2">
                <span className="min-w-0 text-base break-words text-ink">{t.title}</span>
                <span
                  className={
                    t.average < LOW
                      ? "inline-flex items-center gap-1 text-sm font-bold text-warn tabular"
                      : "text-sm text-ink-muted tabular"
                  }
                >
                  {t.average < LOW ? <TrendingDown aria-hidden className="size-4" /> : null}
                  {fmt(t.average)}&nbsp;из 5, {t.count}&nbsp;
                  {plural(t.count, ["оценка", "оценки", "оценок"])}
                  {t.average < LOW ? <span className="sr-only"> — ниже {fmt(LOW)}</span> : null}
                </span>
              </li>
            ))}
          </ul>
          {summary.recent.length ? (
            <div className="flex flex-col gap-2">
              <h3 className="font-sans text-base font-semibold tracking-normal text-ink">
                Отзывы — сначала низкие оценки
              </h3>
              <ul className="flex flex-col gap-3">
                {summary.recent.map((r, i) => (
                  <li key={i} className="flex gap-2.5 border-l-2 border-line py-0.5 pl-3">
                    <MessageSquareQuote
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0 text-ink-muted"
                    />
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <p className="text-base break-words text-ink">«{r.comment}»</p>
                      <p className="text-sm text-ink-muted">
                        {r.typeTitle}, {r.rating}&nbsp;из&nbsp;5
                        {r.ratedAt ? `, ${monthOf(r.ratedAt)}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <Link
            href="/staff/announcements?youSaid=1"
            className="inline-flex min-h-[44px] items-center self-start text-base font-bold break-words text-brand underline-offset-4 hover:underline"
          >
            Ответить объявлением «Вы сказали — мы сделали»
          </Link>
        </div>
      )}
    </section>
  );
}
