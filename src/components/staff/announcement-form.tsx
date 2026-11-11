"use client";

// Форма «Новое объявление» (T09). Проверка — zod на сервере; «Кому» — только свои факультеты:
// чужое сервер отбросит, но в форме его и не показываем. После ошибки введённое не теряется
// (React сбрасывает форму после действия — значения возвращает сервер в state.values).
import { ChevronDown, CircleAlert, CircleCheck } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { FormField } from "@/components/form-field";
import { TextArea } from "@/components/dialog-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { publishAnnouncementAction, type PublishState } from "@/server/actions/announcements";
import { ANNOUNCEMENT_BODY_MAX, ANNOUNCEMENT_TITLE_MAX } from "@/server/services/staff-rules";

type Options = {
  faculties: { code: string; name: string }[];
  groups: { name: string; course: number; facultyCode: string }[];
};

const CHECK = "size-5 shrink-0 accent-brand";
const CHECK_ROW = "flex min-h-11 items-center gap-2.5 text-base text-ink";

export function AnnouncementForm({
  options,
  defaultYouSaid = false,
}: {
  options: Options;
  /** Пришли из «Что говорят студенты» — галочка «Вы сказали — мы сделали» уже стоит */
  defaultYouSaid?: boolean;
}) {
  const [state, action, pending] = useActionState<PublishState, FormData>(
    publishAnnouncementAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const errors = state.fieldErrors ?? {};
  const v = state.values;
  const courses = [...new Set(options.groups.map((g) => g.course))].sort((a, b) => a - b);

  // После ответа с ошибкой — фокус на первое поле с ошибкой; после успеха — на сообщение
  useEffect(() => {
    if (state.fieldErrors)
      formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
    else if (state.ok) formRef.current?.querySelector<HTMLElement>("[data-success]")?.focus();
  }, [state]);

  return (
    <form ref={formRef} action={action} noValidate className="flex flex-col gap-5 lg:max-w-2xl">
      {state.ok && state.message ? (
        <p
          role="status"
          tabIndex={-1}
          data-success
          className="flex items-start gap-2 border-l-2 border-ok py-1 pl-3 text-base font-bold text-ink outline-none"
        >
          <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-ok" />
          {state.message}
        </p>
      ) : null}

      <FormField id="ann-title" label="Заголовок" error={errors.title}>
        {(control) => (
          <Input
            {...control}
            name="title"
            defaultValue={v?.title}
            maxLength={ANNOUNCEMENT_TITLE_MAX}
            autoComplete="off"
            required
          />
        )}
      </FormField>

      <FormField
        id="ann-body"
        label="Текст"
        hint="Можно: **жирный**, *курсив*, списки с «- » и ссылки [текст](/requests) или https://"
        error={errors.body}
      >
        {(control) => (
          <TextArea
            {...control}
            name="body"
            rows={6}
            defaultValue={v?.body}
            maxLength={ANNOUNCEMENT_BODY_MAX}
            required
          />
        )}
      </FormField>

      <fieldset
        aria-describedby={errors.audience ? "ann-audience-error" : "ann-audience-hint"}
        className="flex flex-col gap-3"
      >
        <legend className="mb-1 text-sm font-bold text-ink">Кому</legend>
        <p id="ann-audience-hint" className="text-sm text-ink-muted">
          Только студентам ваших факультетов. Курс и группа — чтобы сузить; не выбраны — всем
          курсам.
        </p>

        <div className="flex flex-wrap gap-x-6">
          {options.faculties.map((f) => (
            <label key={f.code} className={CHECK_ROW}>
              <input
                type="checkbox"
                name="faculty"
                value={f.code}
                defaultChecked={v ? v.faculties.includes(f.code) : true}
                className={CHECK}
              />
              <span>
                {f.code} <span className="text-ink-muted">— {f.name}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="flex flex-wrap gap-x-5">
          {courses.map((c) => (
            <label key={c} className={CHECK_ROW}>
              <input
                type="checkbox"
                name="course"
                value={c}
                defaultChecked={v?.courses.includes(String(c)) ?? false}
                className={CHECK}
              />
              {c} курс
            </label>
          ))}
        </div>

        {options.faculties.map((f) => {
          const groups = options.groups.filter((g) => g.facultyCode === f.code);
          if (!groups.length) return null;
          return (
            <details
              key={f.code}
              className="group"
              open={v?.groups.some((n) => groups.some((g) => g.name === n))}
            >
              {/* У summary с display:flex Chrome прячет треугольник — своя стрелка показывает, что раскрывается */}
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-base text-brand underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden">
                <ChevronDown
                  aria-hidden
                  className="size-5 transition-transform duration-150 ease-out group-open:rotate-180 motion-reduce:transition-none"
                />
                Группы {f.code}
              </summary>
              <div className="flex flex-wrap gap-x-5 pl-1">
                {groups.map((g) => (
                  <label key={g.name} className={CHECK_ROW}>
                    <input
                      type="checkbox"
                      name="group"
                      value={g.name}
                      defaultChecked={v?.groups.includes(g.name) ?? false}
                      className={CHECK}
                    />
                    {g.name}
                  </label>
                ))}
              </div>
            </details>
          );
        })}

        {errors.audience ? (
          <p
            id="ann-audience-error"
            role="alert"
            className="flex items-start gap-1.5 text-sm text-danger"
          >
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {errors.audience}
          </p>
        ) : null}
      </fieldset>

      <label className={CHECK_ROW}>
        <input
          type="checkbox"
          name="pinned"
          defaultChecked={v?.pinned ?? false}
          className={CHECK}
        />
        Закрепить — будет первым на доске объявлений и на главной
      </label>

      {/* T14: ответ на отзывы студентов — у объявления пометка «Вы сказали — мы сделали» */}
      <label className={CHECK_ROW}>
        <input
          type="checkbox"
          name="youSaid"
          defaultChecked={v?.youSaid ?? defaultYouSaid}
          className={CHECK}
        />
        Ответ на отзывы студентов — пометка «Вы сказали — мы сделали»
      </label>

      <div>
        <Button type="submit" loading={pending} className="w-full sm:w-auto">
          Опубликовать
        </Button>
      </div>
    </form>
  );
}
