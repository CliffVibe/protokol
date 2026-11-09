"use client";

import { DialogForm } from "@/components/dialog-form";
import { resetDemoAction, type ResetState } from "@/server/actions/staff";

/** «Сбросить демо» — только при DEMO_MODE=1 (решает сервер). Все выйдут из системы. */
export function ResetDemo({ variant = "ghost" }: { variant?: "ghost" | "outline" }) {
  return (
    <DialogForm<ResetState>
      triggerLabel="Сбросить демо"
      // ghost — в шапке рядом с темой; outline — в блоке «Настройки» на телефоне, где кнопка стоит одна
      triggerVariant={variant}
      title="Сбросить демо-данные?"
      description="Заявки, уведомления, оценки и расписание вернутся к исходным. Все, кто сейчас в системе, выйдут из неё — войти можно будет сразу."
      confirmLabel="Сбросить"
      confirmVariant="destructive"
      action={resetDemoAction}
    />
  );
}
