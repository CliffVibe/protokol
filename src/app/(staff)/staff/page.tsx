import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Кабинет деканата" };

// Заглушка T04: очередь заявок — в T08.
// TODO(T03): requireStaff() — первой строкой, до любых данных.
export default function StaffHomePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Очередь заявок"
        description="Заявки студентов ваших факультетов — по сроку и статусу."
      />
      <EmptyState
        stampPlace
        title="Новых заявок нет"
        description="Когда студент закажет справку, она появится здесь — с ожидаемым сроком."
      />
    </div>
  );
}
