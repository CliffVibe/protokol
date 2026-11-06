"use client";

import { DialogForm } from "@/components/dialog-form";
import { resetDemoAction, type ResetState } from "@/server/actions/staff";

/** «Сбросить демо» — только при DEMO_MODE=1 (решает сервер). Все выйдут из системы. */
export function ResetDemo() {
  return (
    <DialogForm<ResetState>
      triggerLabel="Сбросить демо"
      triggerVariant="ghost"
      title="Сбросить демо-данные?"
      description="Заявки, уведомления, оценки и расписание вернутся к исходным. Все, кто сейчас в системе, выйдут из неё — войти можно будет сразу."
      confirmLabel="Сбросить"
      confirmVariant="destructive"
      action={resetDemoAction}
    />
  );
}
