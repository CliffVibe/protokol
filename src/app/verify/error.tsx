"use client";

import { RotateCw } from "lucide-react";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";

// Ошибка проверки справки (T10): двуязычно, как вся /verify — её открывает и посольство. Без подробностей
// и стектрейсов; «не подтверждено» здесь — не «подделка», а сбой: предлагаем повторить.
export default function VerifyError({ retry }: { retry: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <ErrorState
        title="Не получилось проверить справку"
        headingLevel={1}
        description={
          <>
            Попробуйте ещё раз через минуту.{" "}
            <span lang="en">Could not check the certificate. Please try again in a minute.</span>
          </>
        }
        action={
          <Button onClick={() => retry()}>
            <RotateCw aria-hidden data-icon="inline-start" />
            Повторить <span lang="en">/ Retry</span>
          </Button>
        }
      />
    </div>
  );
}
