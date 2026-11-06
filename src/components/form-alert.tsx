import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type FormAlertProps = {
  /** Что случилось — без извинений и без «Ошибка 401»: «Неверный логин или пароль». */
  title: string;
  /** Что делать: «Проверьте раскладку и попробуйте ещё раз». */
  children?: React.ReactNode;
  className?: string;
};

// Ошибка всей формы (не конкретного поля). Тот же язык, что у плашки концепта — сноска с чертой,
// но черта и иконка цвета --danger. role="alert": скринридер прочитает сразу после отправки.
export function FormAlert({ title, children, className }: FormAlertProps) {
  return (
    <div role="alert" className={cn("flex gap-2.5 border-l-2 border-danger py-1 pl-3", className)}>
      <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
      <div className="flex flex-col gap-0.5">
        <p className="text-base font-bold text-ink">{title}</p>
        {children ? <div className="text-sm text-ink-muted">{children}</div> : null}
      </div>
    </div>
  );
}
