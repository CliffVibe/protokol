"use client";

// Форма заявки (T08): поля — из описания типа (RequestType.fields), проверка — zod на сервере.
// Двойной клик: кнопка недоступна на время отправки, а одноразовый clientKey не даст серверу
// создать вторую заявку, даже если запрос всё-таки уйдёт дважды.
import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Zap } from "lucide-react";
import { FormAlert } from "@/components/form-alert";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mskDateKey } from "@/lib/msk";
import { submitRequestAction, type SubmitState } from "@/server/actions/requests";
import type { FieldSpec } from "@/server/services/request-rules";

const LANGUAGE_LABEL: Record<string, string> = { ru: "Русский", en: "Английский" };

export function RequestForm({
  code,
  fields,
  language,
  changeLanguageHref,
  defaults,
  clientKey,
  autoHint,
}: {
  code: string;
  fields: FieldSpec[];
  language: string;
  /** Ссылка на шаг «Язык» — только у справок с выбором языка. */
  changeLanguageHref?: Route;
  /** Начальные значения полей (дисциплина пересдачи из «Учёбы», T13); после ошибки — введённое. */
  defaults?: Record<string, string>;
  clientKey: string;
  /** T14+, «Справка за 10 секунд»: когда кабинет выдаст справку сразу (auto-issue-rules) */
  autoHint?: string | null;
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

      {/* Язык выбран шагом мастера (T10); сервер всё равно проверяет его по типу справки */}
      <input type="hidden" name="language" value={language} />
      {errors.language ? <FormAlert title={errors.language} /> : null}
      {/* Строка языка — когда он не очевиден: выбирали (можно изменить) или справка не на русском.
          У заявлений и справок только на русском («Заявление на пересдачу», T13) — лишний шум */}
      {changeLanguageHref || language !== "ru" ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-ink">
          <span>
            Язык справки:{" "}
            <span className="font-bold">
              {(LANGUAGE_LABEL[language] ?? language).toLowerCase()}
            </span>
          </span>
          {changeLanguageHref ? (
            <Link
              href={changeLanguageHref}
              className="-mx-2 inline-flex min-h-[44px] items-center rounded-lg px-2 text-brand hover:underline"
            >
              Изменить<span className="sr-only"> язык справки</span>
            </Link>
          ) : null}
        </p>
      ) : null}

      {fields.map((f) => (
        <FormField
          key={f.name}
          id={`f-${f.name}`}
          label={f.required ? f.label : `${f.label} (необязательно)`}
          hint={f.hint}
          error={errors[f.name]}
        >
          {(control) =>
            f.type === "dates" ? (
              // Две даты вместо свободного текста (T14). У первого поля две подписи — «Даты поездки» и «Выезд»:
              // читалка назовёт оба. Сервер соберёт «с … по …» и проверит порядок и прошлое
              <div className="flex flex-wrap gap-3">
                {(
                  [
                    ["from", "Выезд", control.id],
                    ["to", "Возвращение", `${control.id}-to`],
                  ] as const
                ).map(([part, label, id]) => (
                  <div key={part} className="flex min-w-[min(10rem,100%)] flex-1 flex-col gap-1">
                    <label htmlFor={id} className="text-sm text-ink-muted">
                      {label}
                    </label>
                    <Input
                      {...control}
                      id={id}
                      type="date"
                      // Прошлые даты календарь не предлагает; порядок выезд ≤ возвращение проверит сервер
                      min={mskDateKey(new Date())}
                      name={`f.${f.name}.${part}`}
                      defaultValue={state.values?.[`${f.name}.${part}`]}
                      required={f.required}
                    />
                  </div>
                ))}
              </div>
            ) : f.type === "text" ? (
              <Input
                {...control}
                name={`f.${f.name}`}
                defaultValue={state.values?.[f.name] ?? defaults?.[f.name]}
                maxLength={f.maxLength}
                required={f.required}
                autoComplete="off"
              />
            ) : (
              <select
                {...control}
                name={`f.${f.name}`}
                defaultValue={state.values?.[f.name] ?? defaults?.[f.name] ?? ""}
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

      {autoHint ? (
        <p className="flex items-start gap-2 text-sm text-ink">
          <Zap aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
          <span className="min-w-0 break-words">{autoHint}</span>
        </p>
      ) : null}

      <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto sm:self-start">
        Отправить заявку
      </Button>
    </form>
  );
}
