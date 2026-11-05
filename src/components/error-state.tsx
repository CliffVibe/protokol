import { CloudOff } from "lucide-react";
import { cn } from "@/lib/utils";

type ErrorStateProps = {
  /** «Не получилось загрузить расписание» — без технических подробностей и стектрейсов. */
  title?: string;
  description?: React.ReactNode;
  /** Обычно кнопка «Повторить» (retry() из error.tsx). */
  action?: React.ReactNode;
  /** Уровень заголовка: h2 внутри экрана с PageHeader; h1 — когда это весь экран (ошибка). */
  headingLevel?: 1 | 2 | 3;
  className?: string;
};

// Та же раскладка, что у EmptyState, но круг сплошной и цвета --danger: это не «пока пусто», а сбой.
export function ErrorState({
  title = "Не получилось загрузить данные",
  description = "Проверьте интернет и нажмите «Повторить». Если не помогает — зайдите через несколько минут.",
  action,
  headingLevel = 2,
  className,
}: ErrorStateProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <section
      role="alert"
      className={cn("flex items-start gap-5 border-t border-danger/40 pt-6", className)}
    >
      <span
        aria-hidden
        className="flex size-16 shrink-0 items-center justify-center rounded-full border-[1.5px] border-danger text-danger"
      >
        <CloudOff className="size-7" />
      </span>
      <div className="flex min-w-0 flex-col items-start gap-2 pt-1">
        <Heading className="max-w-prose text-lg">{title}</Heading>
        {description ? <p className="max-w-prose text-base text-ink-muted">{description}</p> : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </section>
  );
}
