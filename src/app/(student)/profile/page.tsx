import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Профиль" };

// Заглушка T04: оболочка и навигация. Данные — в T03 и T11.
// TODO(T03): requireStudent() — первой строкой, до любых данных.
export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Профиль" description="Факультет, курс, группа и языковые группы." />
      <EmptyState
        title="Профиль скоро появится"
        description="Здесь будут ваши данные, подписка на расписание и выход со всех устройств."
      />
    </div>
  );
}
