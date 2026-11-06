// RequestTimeline (04-design): Подана → Принята → В работе → Готова → Выдана.
// Пройденный шаг — галочка и дата, текущий — выделен, будущий — тихий. Смысл — иконкой и текстом
// (скрытое «пройден / сейчас / впереди»), не только цветом. Отклонение и отмена — финалом с причиной.
import { Circle, CircleCheck, CircleDot, CircleSlash, CircleX } from "lucide-react";
import { formatRelativeDay, formatTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Timeline } from "@/server/services/request-rules";

const when = (d: Date, now: Date) => `${formatRelativeDay(d, now)}, ${formatTime(d)}`;

const STATE_TEXT = { done: "пройден", current: "сейчас", upcoming: "впереди" } as const;

export function RequestTimeline({
  timeline,
  now,
  /** Кто сделал шаг — только в кабинете сотрудника */
  actors,
}: {
  timeline: Timeline;
  now: Date;
  actors?: Partial<Record<string, string>>;
}) {
  return (
    <ol aria-label="Ход заявки" className="flex flex-col">
      {timeline.steps.map((s, i) => {
        const last = i === timeline.steps.length - 1 && !timeline.end;
        const Icon = s.state === "done" ? CircleCheck : s.state === "current" ? CircleDot : Circle;
        return (
          <li
            key={s.status}
            className={cn(
              "relative flex gap-3 pb-5",
              // Линия между шагами — в столбце иконок
              !last &&
                "before:absolute before:top-7 before:bottom-1 before:left-[11px] before:w-[2px]",
              !last && (s.state === "done" ? "before:bg-ok" : "before:bg-line"),
            )}
          >
            <Icon
              aria-hidden
              className={cn(
                "mt-0.5 size-6 shrink-0",
                s.state === "done" && "text-ok",
                s.state === "current" && "text-brand",
                s.state === "upcoming" && "text-ink-muted",
              )}
            />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p
                className={cn(
                  "text-base",
                  s.state === "current" ? "font-bold text-ink" : "text-ink",
                  s.state === "upcoming" && "text-ink-muted",
                )}
              >
                {s.label}
                <span className="sr-only">, {STATE_TEXT[s.state]}</span>
              </p>
              {s.at ? (
                <p className="text-sm text-ink-muted tabular">
                  {when(s.at, now)}
                  {actors?.[s.status] ? `, ${actors[s.status]}` : ""}
                </p>
              ) : null}
              {s.comment ? <p className="text-sm text-ink">{s.comment}</p> : null}
            </div>
          </li>
        );
      })}
      {timeline.end ? (
        <li className="flex gap-3">
          {timeline.end.status === "REJECTED" ? (
            <CircleX aria-hidden className="mt-0.5 size-6 shrink-0 text-danger" />
          ) : (
            <CircleSlash aria-hidden className="mt-0.5 size-6 shrink-0 text-ink-muted" />
          )}
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-base font-bold text-ink">
              {timeline.end.status === "REJECTED" ? "Отклонена" : "Отменена"}
            </p>
            {timeline.end.at ? (
              <p className="text-sm text-ink-muted tabular">
                {when(timeline.end.at, now)}
                {actors?.[timeline.end.status] ? `, ${actors[timeline.end.status]}` : ""}
              </p>
            ) : null}
            {timeline.end.comment ? (
              <p className="text-base text-ink">
                <span className="font-bold">Причина:</span> {timeline.end.comment}
              </p>
            ) : null}
          </div>
        </li>
      ) : null}
    </ol>
  );
}
