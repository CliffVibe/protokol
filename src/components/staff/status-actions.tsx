"use client";

// Действия сотрудника над заявкой (T08): только разрешённые переходы — кнопками с глаголами.
// Комментарий к шагу необязателен; «Отклонить» — отдельным диалогом с обязательной причиной.
// Сервер всё равно проверяет переход, факультет и «статус всё ещё тот» — кнопки лишь удобство.
import { useActionState, useEffect, useRef } from "react";
import type { RequestStatus } from "@/generated/prisma/client";
import { DialogForm, TextArea } from "@/components/dialog-form";
import { FormAlert } from "@/components/form-alert";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { setRequestStatusAction, type StatusState } from "@/server/actions/staff";
import { ACTION_LABEL } from "./labels";

export function StatusActions({
  number,
  from,
  next,
}: {
  number: string;
  from: RequestStatus;
  next: readonly RequestStatus[];
}) {
  const [state, action, pending] = useActionState<StatusState, FormData>(
    setRequestStatusAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const forward = next.filter((s) => s !== "REJECTED");

  // Шаг сделан — очищаем комментарий (страницу с новым статусом обновит revalidatePath)
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <div className="flex flex-col gap-4">
      {state.ok ? (
        <p role="status" className="text-base font-bold text-ok">
          Статус изменён, студент получил уведомление.
        </p>
      ) : null}
      {state.error ? <FormAlert title={state.error} /> : null}

      {forward.length ? (
        <form ref={formRef} action={action} noValidate className="flex flex-col gap-4">
          <input type="hidden" name="number" value={number} />
          <input type="hidden" name="from" value={from} />
          <FormField
            id="comment"
            label="Комментарий студенту (необязательно)"
            hint="Его увидят в заявке и в уведомлении: «Приняли, срок — 3 рабочих дня»."
            error={state.fieldErrors?.comment}
          >
            {(control) => <TextArea {...control} name="comment" maxLength={500} />}
          </FormField>
          <div className="flex flex-wrap gap-3">
            {forward.map((to, i) => (
              <Button
                key={to}
                type="submit"
                name="to"
                value={to}
                variant={i === 0 ? "default" : "outline"}
                loading={pending}
              >
                {ACTION_LABEL[to]}
              </Button>
            ))}
          </div>
        </form>
      ) : null}

      {next.includes("REJECTED") ? (
        <div className="flex">
          <DialogForm<StatusState>
            triggerLabel="Отклонить"
            triggerVariant="destructive"
            title="Отклонить заявку?"
            description="Студент увидит причину в заявке и в уведомлении. Напишите, что исправить."
            confirmLabel="Отклонить заявку"
            confirmVariant="destructive"
            action={setRequestStatusAction}
            hidden={{ number, from, to: "REJECTED" }}
          >
            {(s) => (
              <FormField id="reason" label="Причина" error={s.fieldErrors?.reason}>
                {(control) => <TextArea {...control} name="reason" maxLength={500} required />}
              </FormField>
            )}
          </DialogForm>
        </div>
      ) : null}
    </div>
  );
}
