"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

// Кнопка «Войти как…» с состоянием загрузки: на медленной сети не даёт нажать дважды (ux-reviewer, T03).
export function DemoSubmit({ name, describedBy }: { name: string; describedBy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="outline"
      loading={pending}
      aria-describedby={describedBy}
      className="h-auto min-h-11 max-w-full py-2 whitespace-normal sm:min-w-44"
    >
      Войти как {name}
    </Button>
  );
}
