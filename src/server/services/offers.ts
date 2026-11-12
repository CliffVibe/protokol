import "server-only";
import type { StudentCtx } from "@/server/auth/guards";
import { gradesOf } from "@/server/repos/grades";
import { dismissOffer, takenTypeCodes } from "@/server/repos/offers";
import { readerOf } from "@/server/repos/profile";
import { numberByClientKey } from "@/server/repos/requests";
import { summarizeStudy } from "./academics";
import {
  offerTypeCodes,
  offersFor,
  semesterOf,
  type OfferCode,
  type OfferSubject,
} from "./offer-rules";
import { submitRequest } from "./requests";

// «Вам положено» (T14): принять или отложить предложение деканата. Кнопка на экране — не доказательство:
// правило пересчитывается здесь, по данным студента из repos (ctx из сессии). Значения полей заявки —
// из правила, не из формы, и проходят ту же проверку, что и обычная подача (submitRequest).

export type AcceptResult = { ok: true; number: string } | { ok: false };

async function subjectOf(ctx: StudentCtx, now: Date): Promise<OfferSubject> {
  const [grades, reader] = await Promise.all([gradesOf(ctx), readerOf(ctx)]);
  return { study: summarizeStudy(grades, now), course: reader?.course ?? null };
}

export async function acceptOffer(
  ctx: StudentCtx,
  code: OfferCode,
  clientKey: string,
  now = new Date(),
): Promise<AcceptResult> {
  // Повтор той же формы (двойное нажатие дошло после первого) — та же заявка, как при обычной подаче (T08)
  const existing = await numberByClientKey(ctx, clientKey);
  if (existing) return { ok: true, number: existing };
  const subject = await subjectOf(ctx, now);
  const taken = await takenTypeCodes(ctx, offerTypeCodes());
  // «Не сейчас» не мешает передумать: отложенное можно подать, пока правило выполняется
  const offer = offersFor(subject, taken, new Set()).find((o) => o.code === code);
  if (!offer) return { ok: false };
  const result = await submitRequest(ctx, {
    code: offer.typeCode,
    language: "ru",
    payload: offer.payload,
    clientKey,
    offered: true,
  });
  return result.ok ? result : { ok: false };
}

export async function dismissMyOffer(
  ctx: StudentCtx,
  code: OfferCode,
  now = new Date(),
): Promise<void> {
  const semester = semesterOf(await subjectOf(ctx, now), now);
  if (semester !== null) await dismissOffer(ctx, code, semester);
}
