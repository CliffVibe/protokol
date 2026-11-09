import { cn } from "@/lib/utils";

type EmptyStateProps = {
  /** Одна человеческая фраза: «Сегодня пар нет. Можно выдохнуть». */
  title: string;
  description?: React.ReactNode;
  /** Одно действие: <Button asChild><Link …>Заказать справку</Link></Button>. */
  action?: React.ReactNode;
  /** Уровень заголовка: h2 внутри экрана с PageHeader; h1 — когда это весь экран (404). */
  headingLevel?: 1 | 2 | 3;
  /** Знак «М.П.» — только там, где речь о справках и заявках: там метафора «ещё не заверено» точна. */
  stampPlace?: boolean;
  className?: string;
};

/**
 * «М.П.» — «место печати» с бланков деканата: пунктирный круг, где печать ещё не стоит.
 * Пустое состояние читается как «здесь пока ничего не заверено», а не как иконка в кружке.
 */
export function StampPlace({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        // Размер в px, а не rem: знак декоративный, при тексте 200% он не должен съедать ширину строки
        "flex size-[64px] shrink-0 -rotate-6 items-center justify-center rounded-full border-[1.5px] border-dashed border-ink-muted/70 font-heading text-[14px] font-semibold tracking-wide text-ink-muted",
        className,
      )}
    >
      М.П.
    </span>
  );
}

// Без карточки: лист бумаги, отделённый тонкой линией, — как раздел документа.
export function EmptyState({
  title,
  description,
  action,
  headingLevel = 2,
  stampPlace = false,
  className,
}: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <section
      className={cn(
        "flex flex-wrap items-start gap-x-5 gap-y-4 border-t border-line pt-6",
        className,
      )}
    >
      {stampPlace ? <StampPlace /> : null}
      {/* min-w-[12rem]: при тексте 200% колонка шире строки — переносится под знак, а не сжимается */}
      <div
        className={cn(
          "flex min-w-[min(12rem,100%)] flex-1 flex-col items-start gap-2",
          stampPlace && "pt-1",
        )}
      >
        <Heading className="max-w-prose text-lg">{title}</Heading>
        {description ? (
          <p className="max-w-prose text-base break-words hyphens-auto text-ink-muted">
            {description}
          </p>
        ) : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </section>
  );
}
