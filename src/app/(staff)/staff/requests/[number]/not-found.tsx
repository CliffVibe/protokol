import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

// Заявка не своего факультета или несуществующая — одинаковый ответ (S1).
export default function StaffRequestNotFound() {
  return (
    <EmptyState
      headingLevel={1}
      title="Такой заявки в вашей очереди нет"
      description="Возможно, номер набран с ошибкой или заявка относится к другому факультету."
      action={
        <Button asChild variant="outline">
          <Link href="/staff">К очереди</Link>
        </Button>
      }
    />
  );
}
