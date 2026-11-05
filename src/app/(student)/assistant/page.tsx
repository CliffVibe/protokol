import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { requireStudent } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Помощник" };

// Заглушка T04: оболочка и навигация. Данные — в T12.
// Доступ — requireStudent() первой строкой, до любых данных (CLAUDE.md → «Железные правила»).
export default async function Page() {
  await requireStudent();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Помощник" description="Ответит на вопросы о регламентах и ваших данных." />
      <EmptyState
        title="Помощник скоро появится"
        description="Можно будет спросить, когда следующий экзамен или какую справку взять для военкомата."
      />
    </div>
  );
}
