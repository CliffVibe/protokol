"use client";

// Редактор ответа помощника (T14+, база знаний из заявок): вопрос так, как спросил бы студент, ключевые
// слова для поиска, ответ. Черновик — «Сохранить» / «Опубликовать»; опубликованный — «Сохранить» /
// «Снять с публикации». Перед публикацией сервер ещё раз ищет личное (номера, контакты, ФИО студента).
import { useActionState, useEffect, useRef } from "react";
import { DialogForm, TextArea } from "@/components/dialog-form";
import { FormAlert } from "@/components/form-alert";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteFaqEntryAction, saveFaqEntryAction, type FaqEntryState } from "@/server/actions/faq";

export function FaqEntryForm({
  entry,
}: {
  entry: { id: string; title: string; keywords: string; body: string; published: boolean };
}) {
  const [state, action, pending] = useActionState<FaqEntryState, FormData>(saveFaqEntryAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  // После ответа сервера фокус — туда, где читать или исправлять (ux-reviewer, T14+): первое поле с ошибкой,
  // общая ошибка или итог «Опубликовано…»
  useEffect(() => {
    const f = formRef.current;
    if (!f) return;
    const target =
      f.querySelector<HTMLElement>("[aria-invalid=true]") ??
      f.querySelector<HTMLElement>("[data-result]");
    target?.focus();
  }, [state]);
  const e = state.fieldErrors ?? {};
  const v = state.values ?? entry;
  return (
    <div className="flex flex-col gap-6">
      <form ref={formRef} action={action} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="id" value={entry.id} />
        <FormField
          id="faq-title"
          label="Вопрос"
          hint="Так, как спросил бы студент: «Нужен ли перевод справки для визы?»"
          error={e.title}
        >
          {(control) => <Input {...control} name="title" maxLength={120} defaultValue={v.title} />}
        </FormField>
        <FormField
          id="faq-keywords"
          label="Ключевые слова"
          hint="Через запятую — как студенты называют это своими словами. По ним помощник найдёт ответ"
          error={e.keywords}
        >
          {(control) => (
            <Input {...control} name="keywords" maxLength={300} defaultValue={v.keywords} />
          )}
        </FormField>
        <FormField
          id="faq-body"
          label="Ответ"
          hint="Без имён, номеров и контактов: ответ увидят все студенты"
          error={e.body}
        >
          {(control) => (
            <TextArea {...control} name="body" rows={6} maxLength={2000} defaultValue={v.body} />
          )}
        </FormField>
        <div aria-live="polite">
          {state.error ? (
            <div data-result tabIndex={-1} className="outline-none">
              <FormAlert title={state.error} />
            </div>
          ) : null}
          {state.ok && state.message ? (
            <p data-result tabIndex={-1} className="text-base font-bold text-ink outline-none">
              {state.message}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-3">
          {entry.published ? (
            <>
              <Button type="submit" name="intent" value="save" loading={pending}>
                Сохранить
              </Button>
              <Button
                type="submit"
                name="intent"
                value="unpublish"
                variant="outline"
                disabled={pending}
              >
                Снять с публикации
              </Button>
            </>
          ) : (
            <>
              <Button type="submit" name="intent" value="publish" loading={pending}>
                Опубликовать
              </Button>
              <Button type="submit" name="intent" value="save" variant="outline" disabled={pending}>
                Сохранить черновик
              </Button>
            </>
          )}
        </div>
      </form>
      <div className="flex flex-col items-start gap-2 border-t border-line pt-4">
        <p className="text-sm text-ink-muted">
          {entry.published
            ? "Удалённый ответ помощник сразу перестанет использовать."
            : "Черновик студенты не видят."}
        </p>
        <DialogForm
          triggerLabel="Удалить"
          triggerAriaLabel="Удалить ответ помощника"
          triggerVariant="ghost"
          title="Удалить ответ помощника?"
          description="Вернуть его не получится. Заявка, из которой он сделан, не изменится."
          confirmLabel="Удалить"
          confirmVariant="destructive"
          action={deleteFaqEntryAction}
          hidden={{ id: entry.id }}
        />
      </div>
    </div>
  );
}
