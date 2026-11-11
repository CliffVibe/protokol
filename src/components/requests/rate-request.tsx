"use client";

import { useActionState } from "react";
import { CircleAlert } from "lucide-react";
import { FormAlert } from "@/components/form-alert";
import { TextArea } from "@/components/dialog-form";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { rateRequestAction, type RateState } from "@/server/actions/requests";

// Оценка решения заявки (T14, «Вы сказали — мы сделали»): пять вариантов радиогруппой (как «Что если…»),
// комментарий необязательно. После отправки страница перерисуется сама (revalidatePath) — форма уйдёт,
// останется «Спасибо». Оценка одна: повтор и чужой номер отсекает сервер.
const OPTIONS = [
  { value: 1, label: "плохо" },
  { value: 2, label: "так себе" },
  { value: 3, label: "нормально" },
  { value: 4, label: "хорошо" },
  { value: 5, label: "отлично" },
] as const;

export function RateRequest({ number }: { number: string }) {
  const [state, action, pending] = useActionState<RateState, FormData>(rateRequestAction, {});
  const ratingError = state.fieldErrors?.rating;
  const commentError = state.fieldErrors?.comment;
  return (
    <form action={action} noValidate className="flex flex-col gap-4 border-t border-line pt-4">
      <input type="hidden" name="number" value={number} />
      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={ratingError ? "rate-error" : undefined}
      >
        <legend className="mb-2 text-base text-ink">Оцените от 1 до 5</legend>
        <div className="flex flex-wrap gap-2">
          {OPTIONS.map((o) => (
            <label
              key={o.value}
              className={cn(
                "inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-lg border border-line px-3 text-base text-ink tabular transition-colors",
                "hover:border-ink-muted has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-ring",
                "has-[:checked]:border-2 has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:font-bold has-[:checked]:text-brand",
              )}
            >
              <input type="radio" name="rating" value={o.value} className="sr-only" />
              {o.value}
              <span className="sr-only"> — {o.label}</span>
            </label>
          ))}
        </div>
        <p className="text-sm text-ink-muted">1 — плохо, 5 — отлично</p>
        {/* Ошибка — цвет, значок и текст (04-design), а не серая подсказка (ux-reviewer, T14) */}
        {ratingError ? (
          <p id="rate-error" role="alert" className="flex items-start gap-1.5 text-sm text-danger">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {ratingError}
          </p>
        ) : null}
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="rate-comment" className="text-base font-bold text-ink">
          Что можно улучшить? (необязательно)
        </label>
        <TextArea
          id="rate-comment"
          name="comment"
          maxLength={300}
          aria-invalid={commentError ? true : undefined}
          aria-describedby={
            commentError ? "rate-comment-error rate-comment-hint" : "rate-comment-hint"
          }
        />
        {commentError ? (
          <p
            id="rate-comment-error"
            role="alert"
            className="flex items-start gap-1.5 text-sm text-danger"
          >
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {commentError}
          </p>
        ) : null}
        <p id="rate-comment-hint" className="text-sm text-ink-muted">
          Деканат увидит отзыв в общей сводке — без вашего имени, номера заявки и точной даты.
        </p>
      </div>
      {state.error ? <FormAlert title={state.error} tabIndex={-1} /> : null}
      <Button
        type="submit"
        variant="outline"
        loading={pending}
        className="h-auto min-h-11 max-w-full self-start py-2 whitespace-normal"
      >
        Отправить оценку
      </Button>
    </form>
  );
}
