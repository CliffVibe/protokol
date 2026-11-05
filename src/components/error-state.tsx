import { CloudOff } from "lucide-react";
import { cn } from "@/lib/utils";

type ErrorStateProps = {
  /** «Не получилось загрузить расписание» — без технических подробностей и стектрейсов. */
  title?: string;
  description?: React.ReactNode;
  /** Обычно кнопка «Повторить» (reset() из error.tsx). */
  action?: React.ReactNode;
  className?: string;
};

export function ErrorState({
  title = "Не получилось загрузить данные",
  description = "Проверьте интернет и попробуйте ещё раз. Если не помогает — зайдите чуть позже.",
  action,
  className,
}: ErrorStateProps) {
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
      <h2 className="max-w-sm text-lead">{title}</h2>
      {description ? <p className="max-w-sm text-small text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </section>
  );
}
