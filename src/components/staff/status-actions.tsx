"use client";

// Действия сотрудника над заявкой (T08): только разрешённые переходы — кнопками с глаголами.
// Комментарий к шагу необязателен; «Отклонить» — отдельным диалогом с обязательной причиной.
// Сервер всё равно проверяет переход, факультет и «статус всё ещё тот» — кнопки лишь удобство.
import { CircleAlert, Sparkles } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import type { RequestStatus } from "@/generated/prisma/client";
import { DialogForm, TextArea } from "@/components/dialog-form";
import { FormAlert } from "@/components/form-alert";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  draftReplyAction,
  setRequestStatusAction,
  type DraftState,
  type StatusState,
} from "@/server/actions/staff";
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
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const forward = next.filter((s) => s !== "REJECTED");
  // «Подготовить черновик» (T12): текст к первому шагу вперёд — в поле комментария; отправляет сотрудник сам
  // Черновик помнит, к какому статусу его готовили: после шага (новый from) подпись исчезает сама
  const [draft, setDraft] = useState<DraftState & { from?: RequestStatus; appended?: boolean }>({});
  const [drafting, startDraft] = useTransition();
  const draftFor = forward[0];

  function makeDraft() {
    if (!draftFor) return;
    startDraft(async () => {
      const result = await draftReplyAction(number, draftFor);
      const field = commentRef.current;
      // Уже написанное сотрудником не затираем — черновик дописывается ниже (ux-reviewer T12)
      const appended = Boolean(result.text && field?.value.trim());
      setDraft({ ...result, from, appended });
      if (result.text && field) {
        field.value = appended ? `${field.value.trimEnd()}\n\n${result.text}` : result.text;
        field.focus();
      }
    });
  }

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
            hint="Его увидят в заявке и в уведомлении."
            error={state.fieldErrors?.comment}
          >
            {(control) => <TextArea {...control} ref={commentRef} name="comment" maxLength={500} />}
          </FormField>
          {draftFor ? (
            <div className="flex flex-col gap-2">
              <div className="min-w-0">
                {/* whitespace-normal: при тексте 200% на 360 подпись переносится, а не уходит вбок */}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={makeDraft}
                  loading={drafting}
                  className="-ml-3 h-auto min-h-[44px] max-w-full text-left whitespace-normal"
                >
                  <Sparkles aria-hidden data-icon="inline-start" />
                  Подготовить черновик
                </Button>
              </div>
              {/* Ошибка — цвет + иконка + текст (04-design → «Формы»). Живой регион есть в DOM заранее;
                  aria-live без role="status": на странице уже есть свой статус «Статус изменён» */}
              <p
                aria-live="polite"
                className={
                  draft.error && draft.from === from && !state.ok
                    ? "flex gap-2 text-sm break-words text-danger"
                    : "text-sm break-words text-ink-muted"
                }
              >
                {draft.from !== from || state.ok ? (
                  ""
                ) : draft.error ? (
                  <>
                    <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                    <span>{draft.error}</span>
                  </>
                ) : draft.text ? (
                  `${draft.appended ? "Черновик дописан под вашим текстом" : `Черновик к шагу «${ACTION_LABEL[draftFor]}»`} — проверьте и поправьте перед отправкой.${draft.notice ? ` ${draft.notice}` : ""}`
                ) : (
                  ""
                )}
              </p>
            </div>
          ) : null}
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
