"use client";

// Подтверждение действия в нативном <dialog> (как лист пары в T06: Radix вставлял бы <style> без
// nonce — прод-CSP). Внутри — форма с Server Action: «Отменить заявку», «Отклонить» с причиной,
// «Сбросить демо». Esc, «Не сейчас» и касание по затемнению закрывают; фокус возвращается на кнопку.
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { FormAlert } from "@/components/form-alert";
import { Button } from "@/components/ui/button";

type State = { ok?: boolean; error?: string; fieldErrors?: Record<string, string | undefined> };

type Props<S extends State> = {
  triggerLabel: string;
  /** Полное имя кнопки для скринридера, когда таких кнопок на экране несколько: «Перенести: Эконометрика, 10:10» */
  triggerAriaLabel?: string;
  /** Уникальный id диалога, когда на экране несколько диалогов с одной подписью кнопки */
  dialogId?: string;
  triggerVariant?: "outline" | "ghost" | "destructive" | "default";
  /** Классы кнопки-триггера: например, перенос длинной подписи при тексте 200% */
  triggerClassName?: string;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  confirmVariant?: "default" | "destructive";
  action: (prev: S, formData: FormData) => Promise<S>;
  /** Скрытые поля формы: номер заявки, статус… */
  hidden?: Record<string, string>;
  /** Поля внутри диалога — получают текущее состояние (ошибки полей) */
  children?: (state: S) => ReactNode;
};

export function DialogForm<S extends State>({
  triggerLabel,
  triggerAriaLabel,
  dialogId,
  triggerVariant = "outline",
  triggerClassName,
  title,
  description,
  confirmLabel,
  confirmVariant = "default",
  action,
  hidden,
  children,
}: Props<S>) {
  const [state, formAction, pending] = useActionState<S, FormData>(action, {} as Awaited<S>);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = `dlg-${dialogId ?? triggerLabel.replace(/\s+/g, "-")}`;

  // Успех — закрываем; данные на странице обновит revalidatePath
  // Ответ с ошибкой: кнопка была недоступна, фокус упал на <body> — ведём его к тому, что исправить
  useEffect(() => {
    if (state.ok || (!state.error && !state.fieldErrors)) return;
    const target =
      dialogRef.current?.querySelector<HTMLElement>("[aria-invalid=true]") ??
      dialogRef.current?.querySelector<HTMLElement>("[role=alert]");
    target?.focus();
  }, [state]);

  useEffect(() => {
    if (state.ok) dialogRef.current?.close();
  }, [state]);

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant={triggerVariant}
        className={triggerClassName}
        aria-haspopup="dialog"
        aria-label={triggerAriaLabel}
        onClick={() => dialogRef.current?.showModal()}
      >
        {triggerLabel}
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => triggerRef.current?.focus()}
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-surface p-0 text-ink backdrop:bg-black/50"
      >
        <form action={formAction} noValidate className="flex flex-col gap-4 p-5">
          <h2 id={titleId} className="text-lg break-words">
            {title}
          </h2>
          {description ? <div className="text-base text-ink">{description}</div> : null}
          {Object.entries(hidden ?? {}).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          {children?.(state)}
          {state.error ? <FormAlert title={state.error} tabIndex={-1} /> : null}
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => dialogRef.current?.close()}>
              Не сейчас
            </Button>
            <Button type="submit" variant={confirmVariant} loading={pending}>
              {confirmLabel}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

/** Многострочное поле в стиле Input (shadcn textarea не ставили — одна причина, один компонент). */
export function TextArea(props: React.ComponentProps<"textarea">) {
  return (
    <textarea
      rows={3}
      {...props}
      className="min-h-24 w-full rounded-lg border border-input bg-surface px-3.5 py-2.5 text-base text-ink outline-none placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring aria-invalid:border-danger aria-invalid:shadow-[inset_0_0_0_1px_var(--danger)]"
    />
  );
}
