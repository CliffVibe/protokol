import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { formatLongDay } from "@/lib/dates";

export const metadata: Metadata = { title: "Сейчас" };

// Заглушка T04: главная лента «Сейчас» — в T05.
// TODO(T03): requireStudent() — первой строкой, до любых данных.
export default function NowPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Сейчас" description={formatLongDay(new Date())} />
      <EmptyState
        title="Здесь появится ваш день"
        description="Какая пара следующая, сколько до неё и что изменилось в расписании."
      />
    </div>
  );
}
