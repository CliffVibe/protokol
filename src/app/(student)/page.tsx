import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { formatLongDay } from "@/lib/dates";
import { requireStudent } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Сейчас" };

// Заглушка T04: главная лента «Сейчас» — в T05.
// Доступ — requireStudent() первой строкой, до любых данных (CLAUDE.md → «Железные правила»).
export default async function NowPage() {
  await requireStudent();
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
