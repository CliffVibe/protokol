import "server-only";
import type { StudentCtx } from "@/server/auth/guards";
import { gradesOf } from "@/server/repos/grades";
import { dismissOffer, takenTypeCodes } from "@/server/repos/offers";
import { numberByClientKey } from "@/server/repos/requests";
import { summarizeStudy } from "./academics";
import { offerTypeCodes, offersFor, type OfferCode } from "./offer-rules";
import { submitRequest } from "./requests";

// «Вам положено» (T14): принять или отложить предложение деканата. Кнопка на экране — не доказательство:
// правило пересчитывается здесь, по данным студента из repos (ctx из сессии).

export type AcceptResult = { ok: true; number: string } | { ok: false };

export async function acceptOffer(
  ctx: StudentCtx,
  code: OfferCode,
  clientKey: string,
): Promise<AcceptResult> {
  // Повтор той же формы (двойное нажатие дошло после первого) — та же заявка, как при обычной подаче (T08)
  const existing = await numberByClientKey(ctx, clientKey);
  if (existing) return { ok: true, number: existing };
  const study = summarizeStudy(await gradesOf(ctx));
  const taken = await takenTypeCodes(ctx, offerTypeCodes());
  // «Не сейчас» не мешает передумать: отложенное можно подать, пока правило выполняется
  const offer = offersFor(study, taken, new Set()).find((o) => o.code === code);
  if (!offer) return { ok: false };
  const result = await submitRequest(ctx, {
    code: offer.typeCode,
    language: "ru",
    payload: {},
    clientKey,
    offered: true,
  });
  return result.ok ? result : { ok: false };
}

export async function dismissMyOffer(ctx: StudentCtx, code: OfferCode): Promise<void> {
  const study = summarizeStudy(await gradesOf(ctx));
  if (study) await dismissOffer(ctx, code, study.semester);
}
