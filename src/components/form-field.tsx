import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/** Атрибуты, которые FormField передаёт полю: id, связь с подсказкой/ошибкой, aria-invalid. */
export type FieldControlProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
};

type FormFieldProps = {
  id: string;
  label: string;
  /** Подсказка под полем: «Как в студенческом билете». */
  hint?: string;
  /** Ошибка поля — что не так и как исправить: «Введите логин». Цвет + иконка + текст. */
  error?: string;
  /** Поле получает готовые атрибуты: {(p) => <Input {...p} name="login" />} */
  children: (control: FieldControlProps) => React.ReactNode;
  className?: string;
};

// Подпись над полем, подсказка и ошибка под ним. Всё связано через aria-describedby,
// поэтому скринридер читает «Пароль, поле, Неверный логин или пароль».
export function FormField({ id, label, hint, error, children, className }: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-bold text-ink">
        {label}
      </label>
      {children({
        id,
        "aria-describedby": describedBy,
        ...(error ? { "aria-invalid": true as const } : {}),
      })}
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-sm text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
