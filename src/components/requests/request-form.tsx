"use client";

// Форма заявки (T08): поля — из описания типа (RequestType.fields), проверка — zod на сервере.
// Двойной клик: кнопка недоступна на время отправки, а одноразовый clientKey не даст серверу
// создать вторую заявку, даже если запрос всё-таки уйдёт дважды.
import { useActionState, useEffect, useRef } from "react";
import { FormAlert } from "@/components/form-alert";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitRequestAction, type SubmitState } from "@/server/actions/requests";
import type { FieldSpec } from "@/server/services/request-rules";

const LANGUAGE_LABEL: Record<string, string> = { ru: "Русский", en: "Английский" };

export function RequestForm({
  code,
  fields,
  languages,
  clientKey,
}: {
  code: string;
  fields: FieldSpec[];
  languages: string[];
  clientKey: string;
}) {
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitRequestAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const errors = state.fieldErrors ?? {};

  // После ответа с ошибкой — фокус на первое поле с ошибкой (кнопка была недоступна)
  useEffect(() => {
    if (!state.fieldErrors) return;
    formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
  }, [state]);

  return (
    <form ref={formRef} action={action} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="type" value={code} />
      <input type="hidden" name="clientKey" value={clientKey} />
      {errors.form ? <FormAlert title={errors.form} /> : null}

      {fields.map((f) => (
        <FormField
          key={f.name}
          id={`f-${f.name}`}
          label={f.required ? f.label : `${f.label} (необязательно)`}
          error={errors[f.name]}
        >
          {(control) =>
            f.type === "text" ? (
              <Input
                {...control}
                name={`f.${f.name}`}
                defaultValue={state.values?.[f.name]}
                maxLength={f.maxLength}
                required={f.required}
                autoComplete="off"
              />
            ) : (
              <select
                {...control}
                name={`f.${f.name}`}
                defaultValue={state.values?.[f.name] ?? ""}
                required={f.required}
                className="h-12 w-full rounded-lg border border-input bg-surface px-3 text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring aria-invalid:border-danger"
              >
                <option value="" disabled>
                  Выберите
                </option>
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            )
          }
        </FormField>
      ))}

      {languages.length > 1 ? (
        <fieldset
          className="flex flex-col gap-2"
          aria-describedby={errors.language ? "language-error" : undefined}
        >
          <legend className="mb-1.5 text-sm font-bold text-ink">Язык справки</legend>
          {languages.map((l, i) => (
            <label key={l} className="flex min-h-11 items-center gap-3 text-base text-ink">
              <input
                type="radio"
                name="language"
                value={l}
                defaultChecked={
                  (state.values?.language ?? languages[0]) === l || (!state.values && i === 0)
                }
                className="size-5 accent-[var(--brand)]"
              />
              {LANGUAGE_LABEL[l] ?? l}
            </label>
          ))}
          {errors.language ? (
            <p id="language-error" className="text-sm text-danger">
              {errors.language}
            </p>
          ) : null}
        </fieldset>
      ) : (
        <input type="hidden" name="language" value={languages[0]} />
      )}

      <Button type="submit" size="lg" loading={pending} className="self-start">
        Отправить заявку
      </Button>
    </form>
  );
}
