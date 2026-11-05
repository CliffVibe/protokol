"use client";

import { RotateCw } from "lucide-react";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";

// Общая ошибка разделов студента. Без стектрейсов и текста исключения — только человеческая фраза.
// Разделы с данными (T05–T12) заводят свой error.tsx: «Не получилось загрузить расписание».
export default function StudentError({ retry }: { retry: () => void }) {
  return (
    <ErrorState
      title="Не получилось загрузить раздел"
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
