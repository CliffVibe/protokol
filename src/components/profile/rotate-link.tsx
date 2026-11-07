"use client";

// «Перевыпустить ссылку» на календарь (T11, S7) с подтверждением успеха на месте (04-design → «Успех»):
// диалог закрывается, а у ссылки — сноска с чертой --ok. Без неё ссылка молча менялась на другую строку
// из 43 символов, и было непонятно, сработало ли (ux-reviewer T11). Проверки — в самом Server Action.
import { useState } from "react";
import { CircleCheck } from "lucide-react";
import { DialogForm } from "@/components/dialog-form";
import { rotateCalendarTokenAction, type RotateState } from "@/server/actions/profile";

export function RotateLink() {
  const [done, setDone] = useState(false);

  async function rotate(): Promise<RotateState> {
    const result = await rotateCalendarTokenAction();
    setDone(Boolean(result.ok));
    return result;
  }

  return (
    <div className="flex flex-col gap-3">
      {done ? (
        <p
          role="status"
          className="flex items-start gap-2 border-l-2 border-ok py-1 pl-3 text-base font-bold text-ink"
        >
          <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-ok" />
          Ссылка перевыпущена. Старая больше не работает — подпишитесь заново по новой ссылке.
        </p>
      ) : null}
      <div>
        <DialogForm
          triggerLabel="Перевыпустить ссылку"
          triggerClassName="h-auto max-w-full min-h-11 py-2 text-left whitespace-normal"
          title="Перевыпустить ссылку?"
          description="Старая ссылка сразу перестанет работать, и календари, подписанные на неё, перестанут обновляться. Подписаться нужно будет заново по новой ссылке."
          confirmLabel="Перевыпустить"
          action={rotate}
        />
      </div>
    </div>
  );
}
