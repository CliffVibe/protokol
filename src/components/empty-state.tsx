import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  /** Одна человеческая фраза: «Сегодня пар нет. Можно выдохнуть». */
  title: string;
  description?: React.ReactNode;
  /** Одно действие: <Button asChild><Link …>Заказать справку</Link></Button>. */
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <section
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-surface px-4 py-10 text-center",
        className,
      )}
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand">
        <Icon aria-hidden className="size-7" />
      </span>
      <h2 className="max-w-sm text-lead">{title}</h2>
      {description ? <p className="max-w-sm text-small text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </section>
  );
}
