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

// Без карточки: лист бумаги, отделённый тонкой линией, — как раздел документа.
// Знак «М.П.» (место печати) убран в T14: он из первой системы «Бланк», с дизайном Б′ не связан
// (оценка «глазами жюри»).
export function EmptyState({
  title,
  description,
  action,
  headingLevel = 2,
  className,
}: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <section className={cn("flex flex-col items-start gap-2 border-t border-line pt-6", className)}>
      <Heading className="max-w-prose text-lg">{title}</Heading>
      {description ? (
        <p className="max-w-prose text-base break-words hyphens-auto text-ink-muted [hyphenate-limit-chars:10_4_4]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </section>
  );
}
