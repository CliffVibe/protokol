import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Заявки" };

// Заглушка T04: оболочка и навигация. Данные — в T08.
// TODO(T03): requireStudent() — первой строкой, до любых данных.
export default function Page() {
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
