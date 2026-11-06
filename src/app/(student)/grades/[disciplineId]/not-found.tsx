import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

// Чужая или несуществующая дисциплина — одинаковый ответ: не подтверждаем, что такая есть у кого-то ещё.
export default function DisciplineNotFound() {
  return (
    <EmptyState
      headingLevel={1}
      title="Такой дисциплины у вас нет"
      description="Возможно, ссылка устарела или пришла от другого студента. Все ваши дисциплины — в разделе «Учёба»."
      action={
        <Button asChild variant="outline">
          <Link href="/grades">К успеваемости</Link>
        </Button>
      }
    />
  );
}
