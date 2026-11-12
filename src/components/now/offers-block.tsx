"use client";

import { useActionState, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { FormAlert } from "@/components/form-alert";
import { Button } from "@/components/ui/button";
import { acceptOfferAction, dismissOfferAction, type OfferState } from "@/server/actions/offers";
import type { Offer } from "@/server/services/offer-rules";

// «Вам положено» (T14): деканат приходит к студенту сам. Язык статусов Б′ — черта слева, значок, текст.
// Кнопки — outline и ghost: на «Сейчас» заливных нет (04-design: экран отвечает, а не просит).
// «Вы подходите», а не «положено»: повышенную стипендию решает комиссия (ux-reviewer, T14).
// Правило вымышленное — так и написано. На узкой ширине (текст 200 %) значок — над текстом.
export function OffersBlock({ offers }: { offers: Offer[] }) {
  if (!offers.length) return null;
  return (
    <section aria-labelledby="offers-title" className="flex flex-col gap-3">
      <h2 id="offers-title" className="text-lg">
        Деканат предлагает
      </h2>
      <ul className="flex flex-col gap-4 border-t border-line pt-3">
        {offers.map((o) => (
          <OfferItem key={o.code} offer={o} />
        ))}
      </ul>
    </section>
  );
}

function OfferItem({ offer }: { offer: Offer }) {
  const [acceptState, accept, accepting] = useActionState<OfferState, FormData>(
    acceptOfferAction,
    {},
  );
  const [dismissState, dismiss, dismissing] = useActionState<OfferState, FormData>(
    dismissOfferAction,
    {},
  );
  // Ключ формы — один на показ: двойное нажатие не создаст вторую заявку (как в мастере, T08)
  const [clientKey] = useState(() => crypto.randomUUID());
  const error = acceptState.error ?? dismissState.error;
  return (
    <li className="@container border-l-4 border-l-brand py-1 pl-4">
      <div className="flex gap-3 @max-[18rem]:flex-col @max-[18rem]:gap-1.5">
        <BadgeCheck aria-hidden className="mt-0.5 size-6 shrink-0 text-brand" />
        <div className="flex min-w-0 flex-col gap-1.5 hyphens-auto [hyphenate-limit-chars:10_4_4]">
          <p className="text-base font-bold break-words text-ink">Вы подходите на {offer.title}</p>
          <p className="text-base break-words text-ink">{offer.why}</p>
          <p className="text-sm break-words text-ink-muted">
            Деканат заметил это сам — заявление уже заполнено. Отменить можно, пока его не приняли;
            «Не сейчас» скроет предложение до следующего семестра. Правило упрощено для демо.
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            <form action={accept}>
              <input type="hidden" name="code" value={offer.code} />
              <input type="hidden" name="clientKey" value={clientKey} />
              <Button
                type="submit"
                variant="outline"
                loading={accepting}
                disabled={dismissing}
                className="h-auto min-h-11 max-w-full py-2 whitespace-normal"
              >
                Подать заявление
              </Button>
            </form>
            <form action={dismiss}>
              <input type="hidden" name="code" value={offer.code} />
              <Button
                type="submit"
                variant="ghost"
                loading={dismissing}
                disabled={accepting}
                className="h-auto min-h-11 py-2"
              >
                Не сейчас
              </Button>
            </form>
          </div>
          {error ? <FormAlert title={error} tabIndex={-1} /> : null}
        </div>
      </div>
    </li>
  );
}
