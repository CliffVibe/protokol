"use client";

import { RotateCw } from "lucide-react";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";

// Ошибка экрана помощника — без стектрейсов, только человеческая фраза (04-design → «Состояния»).
export default function AssistantError({ retry }: { retry: () => void }) {
  return (
    <ErrorState
      title="Не получилось открыть помощника"
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
