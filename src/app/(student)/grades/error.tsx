"use client";

import { RotateCw } from "lucide-react";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";

// Ошибка успеваемости: что случилось и что делать — без стектрейса и текста исключения.
export default function GradesError({ retry }: { retry: () => void }) {
  return (
    <ErrorState
      title="Не получилось загрузить успеваемость"
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
