import { MessagesSquare } from "lucide-react";

/**
 * Пометка «Вы сказали — мы сделали» (T14): объявление — ответ деканата на отзывы студентов.
 * Значок + текст чернилами (Б′: синий — только у ссылок), ультрамарин — у значка.
 */
export function YouSaidMark() {
  return (
    <span className="inline-flex items-center gap-1 font-bold text-ink">
      <MessagesSquare aria-hidden className="size-4 text-brand" />
      Вы сказали — мы сделали
    </span>
  );
}
