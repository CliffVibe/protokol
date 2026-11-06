"use client";

import { DialogForm } from "@/components/dialog-form";
import { cancelRequestAction, type CancelState } from "@/server/actions/requests";

/** «Отменить заявку» — пока она «Подана». Подтверждение: отмену не вернуть. */
export function CancelRequest({ number }: { number: string }) {
  return (
    <DialogForm<CancelState>
      triggerLabel="Отменить заявку"
      triggerVariant="destructive"
      title="Отменить заявку?"
      description="Деканат не будет её готовить. Если справка понадобится, закажите её заново."
      confirmLabel="Отменить заявку"
      confirmVariant="destructive"
      action={cancelRequestAction}
      hidden={{ number }}
    />
  );
}
