import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

// Чужая или несуществующая заявка — одинаковый ответ: не подтверждаем, что она есть у кого-то ещё (S1).
export default function RequestNotFound() {
  return (
    <EmptyState
      headingLevel={1}
      title="Такой заявки у вас нет"
      description="Возможно, номер набран с ошибкой или ссылка пришла от другого студента. Все ваши заявки — в разделе «Заявки»."
      action={
        <Button asChild variant="outline">
          <Link href="/requests">К заявкам</Link>
        </Button>
      }
    />
  );
}
