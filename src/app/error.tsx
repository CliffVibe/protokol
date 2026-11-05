"use client";

import { RotateCw } from "lucide-react";
import { ErrorState } from "@/components/error-state";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";

// Ловит ошибки в самих оболочках (layout студента и сотрудника), которые не видят их error.tsx.
// Оболочки здесь нет — она и упала, — поэтому своя минимальная страница с плашкой концепта.
export default function RootError({ retry }: { retry: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col px-4 pt-10 md:px-6">
        <ErrorState
          title="Что-то пошло не так"
          headingLevel={1}
          action={
            <Button onClick={() => retry()}>
              <RotateCw aria-hidden data-icon="inline-start" />
              Повторить
            </Button>
          }
        />
      </main>
      <SiteFooter />
    </div>
  );
}
