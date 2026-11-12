import type { Metadata, Route } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PurposePicker } from "@/components/requests/purpose-picker";
import { RequestForm } from "@/components/requests/request-form";
import { TypeList } from "@/components/requests/type-list";
import { Button } from "@/components/ui/button";
import { plural } from "@/lib/dates";
import {
  languageOptions,
  parseWizardParams,
  RETAKE_TYPE,
  resolveWizard,
  wizardHref,
} from "@/lib/request-wizard";
import { requireStudent } from "@/server/auth/guards";
import { autoIssueHint } from "@/server/services/auto-issue-rules";
import { LANGUAGE_LABEL } from "@/server/services/request-rules";
import { getDisciplineDetails } from "@/server/services/grades";
import { getCatalog, type CatalogType } from "@/server/services/requests";

// Нейтрально: здесь и справки, и заявления («Заявление на пересдачу», T13)
export const metadata: Metadata = { title: "Новая заявка" };

// Заказ справки. T10 — мастер «Зачем нужна справка?»: цель → подходящие справки → язык → форма;
// «Я знаю, какая справка нужна» (?all=1) — полный каталог T08. Шаг — из GET-параметров
// (lib/request-wizard.ts, zod): битые — первый шаг, не 500. Старые ссылки ?type=… ведут сразу к форме
// (или к выбору языка). Доступ — requireStudent() первой строкой (CLAUDE.md → «Железные правила»).

const sla = (days: number) =>
  `${days} ${plural(days, ["рабочий день", "рабочих дня", "рабочих дней"])}`;
const languages = (t: CatalogType) => t.languages.map((l) => LANGUAGE_LABEL[l] ?? l).join(" или ");
const metaOf = (t: CatalogType) => `Срок — ${sla(t.slaDays)}. Язык: ${languages(t).toLowerCase()}.`;

function AllTypesLink({ label }: { label: string }) {
  return (
    <Link
      href={wizardHref({ all: "1" })}
      className="-ml-2 inline-flex min-h-[44px] w-fit items-center gap-1 rounded-lg px-2 text-base text-brand hover:underline"
    >
      {label}
      <ChevronRight aria-hidden className="size-4" />
    </Link>
  );
}

export default async function NewRequestPage({ searchParams }: PageProps<"/requests/new">) {
  const ctx = await requireStudent();
  const catalog = await getCatalog(ctx);
  const params = parseWizardParams(await searchParams);
  const step = resolveWizard(params, catalog);

  if (step.kind === "form") {
    const { type, purpose } = step;
    // Пересдача из долга (T13): название дисциплины — из БД, только своей (getDisciplineDetails
    // фильтрует по ctx, S1). Чужой или несуществующий id — поле пустое, без ошибки и без подсказки,
    // что такая дисциплина есть. Из адреса берём только id, не текст.
    const defaults: Record<string, string> = {};
    let fromDiscipline: { id: string; name: string } | null = null;
    if (type.code === RETAKE_TYPE && params.discipline) {
      const details = await getDisciplineDetails(ctx, params.discipline);
      const d = details?.rows[0]?.discipline;
      if (d) {
        defaults.discipline = d.name;
        fromDiscipline = { id: d.id, name: d.name };
      }
    }
    const choosable = type.languages.length > 1;
    // Пришли из долга — «назад» к той же дисциплине, а не в каталог справок
    const back = fromDiscipline
      ? { href: `/grades/${fromDiscipline.id}` as Route, label: fromDiscipline.name }
      : choosable
        ? { href: wizardHref({ purpose: purpose?.code, type: type.code }), label: "Язык справки" }
        : purpose
          ? { href: wizardHref({ purpose: purpose.code }), label: "Другие справки" }
          : { href: wizardHref({ all: "1" }), label: "Все справки" };
    return (
      <div className="flex flex-col gap-6 lg:max-w-2xl">
        <PageHeader
          title={type.title}
          back={back}
          description={
            autoIssueHint(type.code)
              ? `${type.description} С типовым адресатом — обычно сразу, со своим — ${sla(type.slaDays)}.`
              : `${type.description} Срок — ${sla(type.slaDays)}.`
          }
        />
        {/* Ключ — на каждый показ формы: повтор той же отправки сервер узнает (двойной клик) */}
        <RequestForm
          code={type.code}
          fields={type.fields}
          language={step.language}
          changeLanguageHref={choosable ? back.href : undefined}
          defaults={defaults}
          clientKey={randomUUID()}
          autoHint={autoIssueHint(type.code)}
        />
      </div>
    );
  }

  if (step.kind === "language") {
    const { type, purpose, recommended } = step;
    return (
      <div className="flex flex-col gap-6 lg:max-w-2xl">
        <PageHeader
          title="На каком языке справка?"
          back={
            purpose
              ? { href: wizardHref({ purpose: purpose.code }), label: "Другие справки" }
              : { href: wizardHref({ all: "1" }), label: "Все справки" }
          }
          description={type.title}
        />
        <TypeList
          label="Язык справки"
          items={languageOptions(type, recommended).map((l) => ({
            key: l,
            href: wizardHref({ purpose: purpose?.code, type: type.code, lang: l }),
            title: LANGUAGE_LABEL[l] ?? l,
            note:
              l === recommended ? "Рекомендуем — для визы обычно просят на английском" : undefined,
          }))}
        />
      </div>
    );
  }

  if (step.kind === "types") {
    const { purpose, types } = step;
    return (
      <div className="flex flex-col gap-6 lg:max-w-3xl">
        <PageHeader
          title="Какая справка подойдёт"
          back={{ href: "/requests/new", label: "Все цели" }}
          description={`Цель — ${purpose.label.toLowerCase()}. Выберите справку — дальше спросим только то, что нужно для неё.`}
        />
        {types.length > 0 ? (
          <TypeList
            label={`Справки для цели «${purpose.label}»`}
            items={types.map((t, i) => ({
              key: t.code,
              href: wizardHref({ purpose: purpose.code, type: t.code }),
              title: t.title,
              description: t.description,
              meta: metaOf(t),
              // Пометка — одна, у рекомендованной: язык и так написан в строке «Язык: …» (ux-reviewer, T10)
              note:
                purpose.code === "visa" && i === 0 && t.languages.includes("en")
                  ? "Чаще всего просят для визы"
                  : undefined,
            }))}
          />
        ) : (
          <EmptyState
            title="Под эту цель справок пока нет"
            description="Посмотрите полный список — возможно, подойдёт другая."
            action={
              <Button asChild variant="outline">
                <Link href={wizardHref({ all: "1" })}>Открыть все справки</Link>
              </Button>
            }
          />
        )}
        {types.length > 0 ? <AllTypesLink label="Нет подходящей? Все справки" /> : null}
      </div>
    );
  }

  if (step.kind === "catalog")
    return (
      <div className="flex flex-col gap-6 lg:max-w-3xl">
        <PageHeader
          title="Все справки"
          back={{ href: "/requests/new", label: "Подобрать по цели" }}
          description="Выберите справку — дальше спросим только то, что нужно для неё."
        />
        <TypeList
          label="Справки и заявления"
          items={catalog.map((t) => ({
            key: t.code,
            href: wizardHref({ type: t.code }),
            title: t.title,
            description: t.description,
            meta: metaOf(t),
          }))}
        />
      </div>
    );

  return (
    <div className="flex flex-col gap-6 lg:max-w-3xl">
      <PageHeader
        title="Заказать справку"
        back={{ href: "/requests", label: "Заявки" }}
        description="Для чего нужна справка? Подберём подходящую и спросим только нужное."
      />
      {/* Кто знает справку — в 1 касание без прокрутки: ссылка над сеткой (ux-reviewer, T10) */}
      <AllTypesLink label="Я знаю, какая справка нужна" />
      <PurposePicker />
    </div>
  );
}
