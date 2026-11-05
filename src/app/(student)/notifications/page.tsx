import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { requireStudent } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Уведомления" };

// Заглушка T04: оболочка и навигация. Данные — в T09.
// Доступ — requireStudent() первой строкой, до любых данных (CLAUDE.md → «Железные правила»).
export default async function Page() {
  await requireStudent();
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
