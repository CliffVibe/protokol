"use client";

import { RotateCw } from "lucide-react";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";

// Общая ошибка кабинета сотрудника — без стектрейсов и текста исключения.
export default function StaffError({ retry }: { retry: () => void }) {
  return (
    <ErrorState
      title="Не получилось загрузить кабинет"
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
