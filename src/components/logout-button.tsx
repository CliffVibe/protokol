import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logout, logoutEverywhere } from "@/server/actions/auth";
import { cn } from "@/lib/utils";

// Кнопки выхода — обычные формы с Server Action: работают без JS.
// Сами actions проверяют сессию; в layout здесь только кнопка, а не проверка доступа.

export function LogoutButton({ className }: { className?: string }) {
  return (
    <form action={logout} className={className}>
      <Button type="submit" variant="ghost" className="w-full justify-start">
        <LogOut aria-hidden />
        Выйти
      </Button>
    </form>
  );
}

/** Блок «Вход» на «Ещё»: выйти здесь или на всех устройствах сразу. */
export function SessionActions({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="session-actions-title"
      className={cn("flex flex-col gap-3 border-t border-line pt-6", className)}
    >
      <h2 id="session-actions-title" className="text-lg font-bold text-ink">
        Выход
      </h2>
      <div className="flex flex-wrap gap-3">
        <form action={logout}>
          <Button type="submit" variant="outline">
            <LogOut aria-hidden />
            Выйти
          </Button>
        </form>
        <form action={logoutEverywhere}>
          <Button type="submit" variant="ghost">
            Выйти на всех устройствах
          </Button>
        </form>
      </div>
      <p className="text-sm text-ink-muted">
        «На всех устройствах» — если входили с чужого телефона или компьютера.
      </p>
    </section>
  );
}
