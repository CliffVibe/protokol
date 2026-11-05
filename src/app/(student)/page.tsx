import type { Metadata } from "next";
import { Sunrise } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Сейчас" };

// Заглушка T04: главная лента «Сейчас» — в T05.
// TODO(T03): requireStudent() — первой строкой, до любых данных.
export default function NowPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Сейчас"
        description="Ближайшая пара, переносы и дедлайны — на одном экране."
      />
      <EmptyState
        icon={Sunrise}
        title="Здесь появится ваш день"
        description="Покажем, какая пара следующая, сколько до неё и что изменилось в расписании."
      />
    </div>
  );
}
