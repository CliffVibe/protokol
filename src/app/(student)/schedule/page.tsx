import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { requireStudent } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Расписание" };

// Заглушка T04: оболочка и навигация. Данные — в T06.
// Доступ — requireStudent() первой строкой, до любых данных (CLAUDE.md → «Железные правила»).
export default async function Page() {
  await requireStudent();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Расписание"
        description="Пары на сегодня и неделю — основная группа и языковые в одной ленте."
      />
      <EmptyState
        title="Расписание скоро появится"
        description="Покажем аудиторию, корпус, преподавателя и подсветим переносы."
      />
    </div>
  );
}
