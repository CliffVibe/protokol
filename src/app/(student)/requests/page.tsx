import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { requireStudent } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Заявки" };

// Заглушка T04: оболочка и навигация. Данные — в T08.
// Доступ — requireStudent() первой строкой, до любых данных (CLAUDE.md → «Железные правила»).
export default async function Page() {
  await requireStudent();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Заявки"
        description="Справки и заявления — как заказ с доставкой: видно, на каком шаге."
      />
      <EmptyState
        stampPlace
        title="Заявок пока нет"
        description="Скоро здесь можно будет заказать справку и следить за её статусом."
      />
    </div>
  );
}
