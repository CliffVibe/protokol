import { CloudOff } from "lucide-react";
import { cn } from "@/lib/utils";

type ErrorStateProps = {
  /** «Не получилось загрузить расписание» — без технических подробностей и стектрейсов. */
  title?: string;
  description?: React.ReactNode;
  /** Обычно кнопка «Повторить» (reset() из error.tsx). */
  action?: React.ReactNode;
  /** Уровень заголовка: h2 внутри экрана с PageHeader; h1 — когда это весь экран (404, ошибка). */
  headingLevel?: 1 | 2 | 3;
  className?: string;
};

export function ErrorState({
  title = "Не получилось загрузить данные",
  description = "Проверьте интернет и попробуйте ещё раз. Если не помогает — зайдите чуть позже.",
  action,
  headingLevel = 2,
  className,
}: ErrorStateProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <section
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-4 py-10 text-center",
        className,
      )}
    >
      <span className="flex size-14 items-center justify-center rounded-full border border-danger/40 text-danger">
        <CloudOff aria-hidden className="size-7" />
      </span>
      <Heading className="max-w-sm text-lead">{title}</Heading>
      {description ? <p className="max-w-sm text-small text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </section>
  );
}
