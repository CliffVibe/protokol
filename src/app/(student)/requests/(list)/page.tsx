import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { RequestRow } from "@/components/requests/request-row";
import { Button } from "@/components/ui/button";
import { requireStudent } from "@/server/auth/guards";
import { getMyRequests } from "@/server/services/requests";

export const metadata: Metadata = { title: "Заявки" };

// Заявки студента (T08, сценарии 3–4): активные — «Готова» первой, архив — выданные, отклонённые,
// отменённые. Одна заливная кнопка на экране — «Заказать справку».
// Доступ — requireStudent() первой строкой, до любых данных (CLAUDE.md → «Железные правила»).
export default async function RequestsPage() {
  const ctx = await requireStudent();
  const { active, archive } = await getMyRequests(ctx);
  const now = new Date();
  const order = (
    // h-auto + whitespace-normal: при тексте 200% подпись переносится, а не выталкивает экран вбок (Б′, Onest шире)
    <Button asChild size="lg" className="h-auto min-h-12 max-w-full py-2 whitespace-normal">
      <Link href="/requests/new">Заказать справку</Link>
    </Button>
  );

  if (!active.length && !archive.length)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Заявки" />
        <EmptyState
          title="Заявок пока нет — закажите первую справку"
          description="Справки и заявления — как заказ с доставкой: видно, на каком шаге и когда будет готово."
          action={order}
        />
      </div>
    );

  return (
    <div className="flex flex-col gap-8 lg:max-w-3xl">
      <PageHeader title="Заявки" action={order} />
      <section aria-labelledby="active-title" className="flex flex-col gap-2">
        <h2 id="active-title" className="text-lg">
          Активные
        </h2>
        {active.length ? (
          <ul
            aria-label="Активные заявки"
            className="flex flex-col divide-y divide-line border-y border-line"
          >
            {active.map((r) => (
              <RequestRow key={r.number} request={r} now={now} />
            ))}
          </ul>
        ) : (
          <p className="border-t border-line pt-3 text-base text-ink-muted">
            Сейчас в работе ничего нет.
          </p>
        )}
      </section>
      {archive.length ? (
        <section aria-labelledby="archive-title" className="flex flex-col gap-2">
          <h2 id="archive-title" className="text-lg">
            Архив
          </h2>
          <ul
            aria-label="Архив заявок"
            className="flex flex-col divide-y divide-line border-y border-line"
          >
            {archive.map((r) => (
              <RequestRow key={r.number} request={r} now={now} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
