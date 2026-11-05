import { cn } from "cn";

// Поле ввода (по мотивам shadcn/ui input). 48px высотой — цель касания с запасом;
// 16px текст — iOS не зумит страницу при фокусе. Рамка --input (= --ink-muted) ≥ 3:1 на --surface.
// Ошибка — aria-invalid="true": рамка --danger; текст ошибки рядом даёт FormField.
function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 rounded-lg border border-input bg-surface px-3.5 text-base text-ink transition-colors duration-150 ease-out outline-none placeholder:text-ink-muted",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "aria-invalid:border-danger aria-invalid:shadow-[inset_0_0_0_1px_var(--danger)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
