import { BadgeCheck } from "lucide-react";

/** «Предложено деканатом» (T14, «Вам положено»): заявку деканат предложил сам, студент подтвердил. */
export function OfferedMark() {
  return (
    <span className="inline-flex items-center gap-1 text-sm font-bold text-ink">
      <BadgeCheck aria-hidden className="size-4 shrink-0 text-brand" />
      Предложено деканатом
    </span>
  );
}
