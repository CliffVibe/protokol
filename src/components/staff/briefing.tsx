// Утренний брифинг сотрудника (T14+, ресерч «деканату»): первый экран дня — что горит, что выдать пачкой,
// что нового, какие ответы помощника ждут проверки. Подсчёты, без ИИ. Каждый пункт — ссылка туда, где это
// сделать. Строки под линиями, как лента «Сейчас»; тон — значком и цветом значка, текст — чернилами (Б′).
import Link from "next/link";
import type { Route } from "next";
import {
  AlarmClock,
  BookOpenCheck,
  ChevronRight,
  CircleCheck,
  Inbox,
  PackageCheck,
  type LucideIcon,
} from "lucide-react";
import { greetingFor, plural } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Briefing } from "@/server/services/request-rules";

const n = (count: number, forms: [string, string, string]) => `${count} ${plural(count, forms)}`;

type Item = { href: Route; icon: LucideIcon; tone: string; count: number; text: string };

/** «Морозова Ирина Сергеевна» → «Ирина Сергеевна» */
const nameAndPatronymic = (fullName: string) => fullName.split(/\s+/).slice(1).join(" ");

export function BriefingBlock({
  briefing: b,
  fullName,
  now,
}: {
  briefing: Briefing | null;
  fullName: string | null;
  now: Date;
}) {
  if (!b)
    // Сбой сводки — строкой, как «Что говорят студенты»: очередь ниже работает
    return (
      <p className="border-y border-line py-2.5 text-base text-ink-muted">
        Сводка дня не загрузилась — очередь ниже работает.
      </p>
    );
  const today = b.urgent - b.overdue;
  // Срочность — словами, а не только цветом значка (ux-reviewer, T14+)
  const urgentText =
    b.overdue && today
      ? `Горят ${n(b.urgent, ["заявка", "заявки", "заявок"])}: ${b.overdue} ${plural(b.overdue, ["просрочена", "просрочены", "просрочено"])}, у ${today} срок сегодня`
      : b.overdue
        ? `${n(b.overdue, ["заявка просрочена", "заявки просрочены", "заявок просрочено"])}`
        : `${n(today, ["заявка", "заявки", "заявок"])} — срок сегодня`;
  const items: Item[] = [
    {
      href: "/staff?due=urgent" as Route,
      icon: AlarmClock,
      tone: b.overdue ? "text-danger" : "text-warn",
      count: b.urgent,
      text: urgentText,
    },
    {
      href: "/staff?status=ready" as Route,
      icon: PackageCheck,
      tone: "text-brand",
      count: b.ready,
      text: `${n(b.ready, ["справка готова", "справки готовы", "справок готовы"])} — выдать пачкой`,
    },
    {
      href: "/staff?due=new" as Route,
      icon: Inbox,
      tone: "text-brand",
      count: b.fresh,
      text: `${n(b.fresh, ["новая заявка", "новые заявки", "новых заявок"])} со вчера`,
    },
    {
      href: "/staff/answers" as Route,
      icon: BookOpenCheck,
      tone: "text-brand",
      count: b.drafts,
      text: `${n(b.drafts, ["ответ помощника ждёт", "ответа помощника ждут", "ответов помощника ждут"])} проверки`,
    },
  ].filter((i) => i.count > 0);
  const name = fullName ? nameAndPatronymic(fullName) : "";

  return (
    <section aria-labelledby="briefing-title" className="flex flex-col gap-3 lg:max-w-3xl">
      {/* h2 — смысл раздела (навигация по заголовкам), приветствие — строкой (ux-reviewer, T14+) */}
      <div className="flex flex-col gap-0.5">
        <h2 id="briefing-title" className="text-lg">
          Главное на сегодня
        </h2>
        <p className="text-base break-words text-ink-muted">
          {greetingFor(now)}
          {name ? `, ${name}` : ""}. Ваши факультеты — по одному касанию.
        </p>
      </div>
      {items.length ? (
        <ul className="flex flex-col divide-y divide-line border-y border-line">
          {items.map((i) => (
            <li key={i.href}>
              <Link
                href={i.href}
                className="group flex min-h-11 items-start gap-2.5 py-2.5 text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
              >
                <i.icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", i.tone)} />
                <span className="min-w-0 flex-1 break-words group-hover:underline">{i.text}</span>
                <ChevronRight aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-start gap-2.5 border-y border-line py-2.5 text-base text-ink">
          <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-ok" />
          Всё спокойно: просрочек нет, к выдаче ничего, ответы проверены.
        </p>
      )}
      <Link
        href={"/staff/answers" as Route}
        className="inline-flex min-h-11 items-center gap-2 self-start text-base font-bold text-brand underline-offset-4 hover:underline md:hidden"
      >
        <BookOpenCheck aria-hidden className="size-5 shrink-0" />
        База ответов помощника
      </Link>
    </section>
  );
}
