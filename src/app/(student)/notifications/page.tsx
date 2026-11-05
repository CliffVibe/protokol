import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Уведомления" };

// Заглушка T04: оболочка и навигация. Данные — в T09.
// TODO(T03): requireStudent() — первой строкой, до любых данных.
export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Уведомления"
        description="Объявления деканата, переносы пар и статусы заявок."
      />
      <EmptyState
        title="Уведомлений пока нет"
        description="Сюда придут переносы пар, объявления деканата и новости по заявкам."
      />
    </div>
  );
}
