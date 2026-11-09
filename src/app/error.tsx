"use client";

import Link from "next/link";
import { CloudOff, RotateCw } from "lucide-react";
import { SystemPage } from "@/components/system-page";
import { Button } from "@/components/ui/button";

// Ловит ошибки в самих оболочках (layout студента и сотрудника), которые не видят их error.tsx.
// Оболочки здесь нет — она и упала, — поэтому своя страница со знаком и плашкой концепта.
// Без стектрейса и текста ошибки: в проде Next отдаёт клиенту только digest — короткий хеш,
// по которому ошибку находят в логах сервера. Его и показываем: пригодится, если писать в деканат.
export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <SystemPage
      code="Ошибка 500"
      icon={CloudOff}
      tone="danger"
      title="Что-то пошло не так"
      actions={
        <>
          <Button onClick={() => retry()}>
            <RotateCw aria-hidden data-icon="inline-start" />
            Повторить
          </Button>
          <Button asChild variant="outline">
            <Link href="/">На главную</Link>
          </Button>
        </>
      }
    >
      <p>
        Сбой на нашей стороне. Нажмите «Повторить»; если не помогает — зайдите через несколько
        минут.
      </p>
      {error.digest ? (
        <p className="text-sm">
          Код ошибки: <span className="font-mono break-all text-ink">{error.digest}</span>. Если
          пишете в деканат — назовите его.
        </p>
      ) : null}
    </SystemPage>
  );
}
