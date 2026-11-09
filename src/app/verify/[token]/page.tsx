import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ClockAlert, ShieldCheck, ShieldX, type LucideIcon } from "lucide-react";
import { certificateTitleEn } from "@/lib/certificate-en";
import { cn } from "@/lib/utils";
import { verifyTokenSchema } from "@/lib/verify-token";
import { documentByToken, type VerifyState } from "@/server/repos/verify";

// Публичная проверка справки по QR (T10). Без входа: guard не нужен — страница показывает только
// разрешённое S7: «действительна / отозвана / срок истёк», тип, дату выдачи, срок действия и инициалы. Номера
// зачётки, оценок, причины отзыва нет и в выборке (repos/verify.ts). Битый токен — 404 без запроса к БД.
// Своего loading.tsx нет: проверка до начала стрима, «не найдена» — настоящий HTTP 404.
// Двуязычная: справку для визы проверяет посольство — английский идёт строкой под русским.

export const metadata: Metadata = {
  title: "Проверка справки",
  // Страница по секретному адресу: поисковикам незачем её знать
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const load = cache(async (raw: string) => {
  const token = verifyTokenSchema.safeParse(raw);
  if (!token.success) return null;
  return documentByToken(token.data, new Date());
});

const STATE: Record<
  VerifyState,
  { ru: string; en: string; icon: LucideIcon; tone: string; hint: string; hintEn: string }
> = {
  valid: {
    ru: "Справка действительна",
    en: "This certificate is valid",
    icon: ShieldCheck,
    tone: "border-ok text-ok",
    hint: "Сверьте тип, дату и инициалы с бумажной справкой.",
    hintEn: "Check that the type, date and initials match the paper certificate.",
  },
  revoked: {
    ru: "Справка отозвана деканатом",
    en: "This certificate has been revoked",
    icon: ShieldX,
    tone: "border-danger text-danger",
    hint: "Эта справка больше недействительна. Попросите владельца предъявить новую.",
    hintEn: "This certificate is no longer valid. Ask the holder for a new one.",
  },
  expired: {
    ru: "Срок действия справки истёк",
    en: "This certificate has expired",
    icon: ClockAlert,
    tone: "border-warn text-warn",
    hint: "Справка была выдана, но срок её действия закончился. Попросите владельца заказать новую.",
    hintEn:
      "The certificate was issued, but its validity period has ended. Ask the holder to order a new one.",
  },
};

const longDate = (d: Date, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);

export default async function VerifyPage({ params }: PageProps<"/verify/[token]">) {
  const doc = await load((await params).token);
  if (!doc) notFound();
  const s = STATE[doc.state];
  const Icon = s.icon;

  return (
    // Колонка по центру: навигации нет, страница — как документ, а не обрезанный кабинет (ux-reviewer)
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      {/* Цвет — не единственный носитель смысла: иконка, черта и текст статуса */}
      <section
        aria-labelledby="verify-title"
        className={cn("flex gap-4 border-l-4 py-1 pl-4", s.tone)}
      >
        <Icon aria-hidden className="mt-1 size-[32px] shrink-0" />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 id="verify-title" className="text-xl break-words text-ink lg:text-2xl">
            {s.ru}
          </h1>
          <p lang="en" className="text-lg text-ink">
            {s.en}
          </p>
        </div>
      </section>

      <dl className="flex flex-col divide-y divide-line border-y border-line text-base">
        <div className="flex flex-col gap-0.5 py-3">
          <dt className="text-sm text-ink-muted">
            Справка <span lang="en">/ Certificate</span>
          </dt>
          <dd className="font-bold break-words text-ink">{doc.typeTitle}</dd>
          {doc.language === "en" ? (
            <dd lang="en" className="break-words text-ink">
              {certificateTitleEn(doc.typeCode)}
            </dd>
          ) : null}
        </div>
        <div className="flex flex-col gap-0.5 py-3">
          <dt className="text-sm text-ink-muted">
            Дата выдачи <span lang="en">/ Date of issue</span>
          </dt>
          <dd className="font-bold text-ink">
            {longDate(doc.issuedAt, "ru-RU")}{" "}
            <span lang="en" className="font-normal text-ink-muted">
              / {longDate(doc.issuedAt, "en-GB")}
            </span>
          </dd>
        </div>
        {doc.validUntil ? (
          <div className="flex flex-col gap-0.5 py-3">
            <dt className="text-sm text-ink-muted">
              {doc.state === "expired" ? "Действовала до" : "Действует до"}{" "}
              <span lang="en">/ Valid until</span>
            </dt>
            <dd className="font-bold text-ink">
              {longDate(doc.validUntil, "ru-RU")}{" "}
              <span lang="en" className="font-normal text-ink-muted">
                / {longDate(doc.validUntil, "en-GB")}
              </span>
            </dd>
          </div>
        ) : null}
        <div className="flex flex-col gap-0.5 py-3">
          <dt className="text-sm text-ink-muted">
            Владелец <span lang="en">/ Holder</span>
          </dt>
          <dd className="font-bold break-words text-ink">{doc.holder}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-1 text-sm text-ink-muted">
        <p>{s.hint}</p>
        <p lang="en">{s.hintEn}</p>
        <p className="pt-2">
          Здесь показаны только статус, тип справки, срок действия и инициалы владельца — других
          данных студента страница не раскрывает.
        </p>
        <p lang="en">
          This page shows only the status, certificate type, validity dates and the holder&apos;s
          initials — no other student data.
        </p>
      </div>
    </div>
  );
}
