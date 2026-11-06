"use client";

import { RotateCw } from "lucide-react";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";

// Ошибка заявок: что случилось и что делать — без стектрейса и текста исключения.
export default function RequestsError({ retry }: { retry: () => void }) {
  return (
    <ErrorState
      title="Не получилось загрузить заявки"
      headingLevel={1}
      action={
        <Button onClick={() => retry()}>
          <RotateCw aria-hidden data-icon="inline-start" />
          Повторить
        </Button>
      }
    />
  );
}
