import { DemoSubmit } from "@/components/demo-submit";
import { DEMO_ACCOUNTS } from "@/lib/demo-accounts";
import { cn } from "@/lib/utils";
import { demoSwitch } from "@/server/actions/auth";
import { isDemoMode } from "@/server/services/auth";

// «Другой аккаунт» без выхода (оценка «глазами жюри», 12.11): эксперт проходит шесть сценариев под четырьмя
// аккаунтами, и каждый раз «Выйти → Войти как…» стоило минуту. Только при DEMO_MODE=1 (решает сервер);
// обычные формы — работают без JS. Доступ проверяет сам Server Action (requireUser + authenticateDemo).
// Кнопки и подписи — как на /login (ux-reviewer: глагол на кнопке, «кто это» видно, а не только читалке).
export function DemoSwitch({
  current,
  headingLevel = 2,
  className,
}: {
  /** Имя текущего демо-аккаунта — его кнопку не показываем */
  current: string | null;
  /** Внутри секции со своим h2 (кабинет сотрудника, «Профиль») — h3 */
  headingLevel?: 2 | 3;
  className?: string;
}) {
  if (!isDemoMode()) return null;
  const Heading = `h${headingLevel}` as const;
  const others = DEMO_ACCOUNTS.filter((a) => a.name !== current);
  return (
    <section aria-labelledby="demo-switch-title" className={cn("flex flex-col gap-3", className)}>
      <Heading id="demo-switch-title" className="text-lg text-ink">
        Демо: другой аккаунт
      </Heading>
      <ul className="flex flex-col gap-3">
        {others.map((a) => (
          <li key={a.login}>
            <form
              action={demoSwitch}
              className="flex flex-col items-start gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4"
            >
              <input type="hidden" name="login" value={a.login} />
              <DemoSubmit name={a.name} describedBy={`demo-switch-${a.login}`} />
              <span id={`demo-switch-${a.login}`} className="text-sm text-ink-muted">
                {a.about}
              </span>
            </form>
          </li>
        ))}
      </ul>
      <p className="text-sm text-ink-muted">
        Без выхода и пароля — чтобы пройти сценарии под разными аккаунтами.
      </p>
    </section>
  );
}
