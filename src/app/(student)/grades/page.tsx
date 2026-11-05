import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { requireStudent } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Учёба" };

// Заглушка T04: оболочка и навигация. Данные — в T07.
// Доступ — requireStudent() первой строкой, до любых данных (CLAUDE.md → «Железные правила»).
export default async function Page() {
  await requireStudent();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Учёба" description="Рейтинг по дисциплинам, сессия и стипендия." />
      <EmptyState
        title="Успеваемость скоро появится"
        description="Покажем рейтинг из 100 по каждой дисциплине и ответим, сохраняется ли стипендия."
      />
    </div>
  );
}
