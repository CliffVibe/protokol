import { cn } from "@/lib/utils";

type EmptyStateProps = {
  /** Одна человеческая фраза: «Сегодня пар нет. Можно выдохнуть». */
  title: string;
  description?: React.ReactNode;
  /** Одно действие: <Button asChild><Link …>Заказать справку</Link></Button>. */
  action?: React.ReactNode;
  /** Уровень заголовка: h2 внутри экрана с PageHeader; h1 — когда это весь экран (404). */
  headingLevel?: 1 | 2 | 3;
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
        "flex size-16 shrink-0 -rotate-6 items-center justify-center rounded-full border-[1.5px] border-dashed border-ink-muted/70 font-heading text-small font-bold tracking-wide text-ink-muted",
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
  className,
}: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <section className={cn("flex items-start gap-5 border-t border-line pt-6", className)}>
      <StampPlace />
      <div className="flex min-w-0 flex-col items-start gap-2 pt-1">
        <Heading className="max-w-prose text-lead">{title}</Heading>
        {description ? <p className="max-w-prose text-body text-ink-muted">{description}</p> : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </section>
  );
}
