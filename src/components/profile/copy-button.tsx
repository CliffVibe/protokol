"use client";

// «Скопировать ссылку» на подписку (T11). Результат — текстом в role="status" (скринридер прочтёт),
// не только сменой иконки. Нет доступа к буферу (старый браузер, http) — подсказываем скопировать вручную.
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        className="self-start h-auto max-w-full min-h-11 py-2 text-left whitespace-normal"
        onClick={copy}
      >
        {state === "copied" ? (
          <Check aria-hidden data-icon="inline-start" />
        ) : (
          <Copy aria-hidden data-icon="inline-start" />
        )}
        {label}
      </Button>
      <p role="status" className="min-h-5 text-sm text-ink-muted">
        {state === "copied"
          ? "Ссылка скопирована"
          : state === "failed"
            ? "Не получилось скопировать — выделите ссылку выше и скопируйте вручную"
            : ""}
      </p>
    </div>
  );
}
