import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { randomUUID } from "node:crypto";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { RequestForm } from "@/components/requests/request-form";
import { plural } from "@/lib/dates";
import { requireStudent } from "@/server/auth/guards";
import { LANGUAGE_LABEL } from "@/server/services/request-rules";
import { getCatalog, type CatalogType } from "@/server/services/requests";
import { z } from "zod";

export const metadata: Metadata = { title: "Заказать справку" };

// Заказ справки (T08): каталог — простым списком (мастер «Зачем нужна справка?» — T10);
// ?type=код — форма с полями из описания типа. Битый ?type — снова каталог, не 500.
// Доступ — requireStudent() первой строкой (CLAUDE.md → «Железные правила»).
const typeParam = z.string().regex(/^[a-z_]{1,40}$/);

const sla = (days: number) =>
  `${days} ${plural(days, ["рабочий день", "рабочих дня", "рабочих дней"])}`;
const languages = (t: CatalogType) => t.languages.map((l) => LANGUAGE_LABEL[l] ?? l).join(" или ");

export default async function NewRequestPage({ searchParams }: PageProps<"/requests/new">) {
  const ctx = await requireStudent();
  const { type: rawType } = await searchParams;
  const catalog = await getCatalog(ctx);
  const code = typeParam.safeParse(rawType);
  const type = code.success ? catalog.find((t) => t.code === code.data) : undefined;

  if (type)
    return (
      <div className="flex flex-col gap-6 lg:max-w-2xl">
        <PageHeader
          title={type.title}
          back={{ href: "/requests/new", label: "Все справки" }}
          description={`${type.description} Срок — ${sla(type.slaDays)}.`}
        />
        {/* Ключ — на каждый показ формы: повтор той же отправки сервер узнает (двойной клик) */}
        <RequestForm
          code={type.code}
          fields={type.fields}
          languages={type.languages}
          clientKey={randomUUID()}
        />
      </div>
    );

  return (
    <div className="flex flex-col gap-6 lg:max-w-3xl">
      <PageHeader
        title="Заказать справку"
        back={{ href: "/requests", label: "Заявки" }}
        description="Выберите справку — дальше спросим только то, что нужно для неё."
      />
      <ul
        aria-label="Справки и заявления"
        className="flex flex-col divide-y divide-line border-y border-line"
      >
        {catalog.map((t) => (
          <li key={t.code} className="relative flex items-center gap-3 py-4">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Link
                href={`/requests/new?type=${t.code}` as Route}
                className="self-start text-base font-bold text-ink outline-none after:absolute after:inset-0 after:rounded-sm hover:underline focus-visible:after:ring-2 focus-visible:after:ring-brand"
              >
                {t.title}
              </Link>
              <p className="text-sm text-ink">{t.description}</p>
              <p className="text-sm text-ink-muted">
                Срок — {sla(t.slaDays)}. Язык: {languages(t).toLowerCase()}.
              </p>
            </div>
            <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-muted" />
          </li>
        ))}
      </ul>
    </div>
  );
}
