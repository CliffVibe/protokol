"use client";

// «Сделать ответом помощника» (T14+, база знаний из заявок): сервер обезличивает последний ответ
// сотрудника по этой заявке и открывает редактор черновика. Студенты ничего не увидят до публикации.
import { useActionState } from "react";
import { BookOpenCheck } from "lucide-react";
import { FormAlert } from "@/components/form-alert";
import { Button } from "@/components/ui/button";
import { makeFaqDraftAction, type MakeDraftState } from "@/server/actions/faq";

export function MakeAnswerButton({ number }: { number: string }) {
  const [state, action, pending] = useActionState<MakeDraftState, FormData>(makeFaqDraftAction, {});
  return (
    <form action={action} className="flex flex-col items-start gap-3">
      <input type="hidden" name="number" value={number} />
      <Button
        type="submit"
        variant="outline"
        loading={pending}
        className="h-auto min-h-11 max-w-full py-2 whitespace-normal"
      >
        <BookOpenCheck aria-hidden />
        Сделать ответом помощника
      </Button>
      {state.error ? <FormAlert title={state.error} tabIndex={-1} /> : null}
    </form>
  );
}
