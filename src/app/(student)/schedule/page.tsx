import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Расписание" };

// Заглушка T04: оболочка и навигация. Данные — в T06.
// TODO(T03): requireStudent() — первой строкой, до любых данных.
export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Расписание"
        description="Пары на сегодня и неделю — основная группа и языковые в одной ленте."
      />
      <EmptyState
        icon={CalendarDays}
        title="Расписание скоро появится"
        description="Покажем аудиторию, корпус, преподавателя и подсветим переносы."
      />
    </div>
  );
}
