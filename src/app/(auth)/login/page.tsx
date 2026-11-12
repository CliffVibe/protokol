import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConceptBanner } from "@/components/concept-banner";
import { LogoMark } from "@/components/logo-mark";
import { ClearOfflineData } from "@/components/pwa/clear-offline-data";
import { DEMO_ACCOUNTS, demoScenarios } from "@/lib/demo-accounts";
import { demoLogin } from "@/server/actions/auth";
import { homeFor } from "@/server/auth/guards";
import { getSession } from "@/server/auth/session";
import { isDemoMode } from "@/server/services/auth";
import { DemoSubmit } from "./demo-submit";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Вход" };

// Экран входа. Уже вошли — сразу в свой кабинет. Демо-блок — только при DEMO_MODE=1 (решает сервер).
// ?demo=wait — демо-вход упёрся в лимит частоты (services/auth.ts → DEMO_LOGINS_PER_MINUTE).
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (session) redirect(homeFor(session.role));
  const demo = isDemoMode();
  const demoWait = demo && (await searchParams).demo === "wait";

  return (
    <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-16">
      <section
        aria-labelledby="login-title"
        className="flex w-full min-w-0 flex-col gap-6 lg:max-w-md"
      >
        {/* flex-wrap + basis: при тексте 200% заголовок уходит под печать, а не вылезает вбок */}
        <div className="flex flex-wrap items-center gap-4">
          <LogoMark variant="sheet" className="size-24 lg:size-32" />
          <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
            <h1
              id="login-title"
              className="font-heading text-2xl font-semibold break-words hyphens-auto text-ink lg:text-3xl"
            >
              Вход в&nbsp;Протокол
            </h1>
            <p className="text-base text-ink-muted">Цифровой деканат: учёба, справки и связь.</p>
          </div>
        </div>

        <ConceptBanner />
        {/* После выхода — стереть офлайн-копию расписания (T11): общий компьютер */}
        <ClearOfflineData />

        {/* На телефоне демо-кнопки — ниже формы, за первым экраном (оценка «глазами жюри», T14): заметная
            ссылка к ним сразу под плашкой. С lg демо-блок стоит колонкой рядом — ссылка не нужна */}
        {demo ? (
          <Button
            asChild
            variant="outline"
            className="h-auto min-h-11 py-2 whitespace-normal lg:hidden"
          >
            {/* Подпись — что делает ссылка: ведёт к кнопкам «Войти как…», а не входит сама (ux-reviewer) */}
            <a href="#demo-title">
              Демо-вход без пароля
              <ArrowDown aria-hidden className="size-4 shrink-0" />
            </a>
          </Button>
        ) : null}

        <LoginForm />

        <p className="text-sm text-ink-muted">
          Тестовые аккаунты — в описании работы.
          {demo ? (
            <>
              {" Или войдите одним нажатием — "}
              <a href="#demo-title" className="text-brand underline underline-offset-4">
                в блоке «Демо-режим»
              </a>
              .
            </>
          ) : null}
        </p>
      </section>

      {demo ? <DemoPanel wait={demoWait} /> : null}
    </div>
  );
}

function DemoPanel({ wait }: { wait: boolean }) {
  return (
    <section
      aria-labelledby="demo-title"
      className="flex w-full min-w-0 flex-col gap-6 border-t border-line pt-8 lg:max-w-xl lg:border-t-0 lg:border-l lg:pt-0 lg:pl-16"
    >
      <div className="flex flex-col gap-2">
        <h2 id="demo-title" className="scroll-mt-6 font-heading text-lg font-semibold text-ink">
          Демо-режим
        </h2>
        <p className="text-base text-ink-muted">
          Для жюри: вход без пароля. Все данные вымышленные и каждую ночь возвращаются к исходным, а
          предложение деканата, оценка заявки и шаги Ирины по заявкам возвращаются через 15 минут
          после прошлого эксперта.
        </p>
      </div>
      {wait ? (
        <p role="alert" className="border-l-2 border-warn py-1 pl-3 text-base text-ink">
          Слишком много входов подряд с этого адреса — подождите минуту и попробуйте снова.
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {DEMO_ACCOUNTS.map((a) => (
          <li key={a.login}>
            {/* До sm — подпись всегда под кнопкой (ровный ритм), с sm — в ряд */}
            <form
              action={demoLogin}
              className="flex flex-col items-start gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4"
            >
              <input type="hidden" name="login" value={a.login} />
              <DemoSubmit name={a.name} describedBy={`demo-${a.login}`} />
              <span id={`demo-${a.login}`} className="text-sm text-ink-muted">
                {a.about}
              </span>
            </form>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold text-ink">6 сценариев для проверки</h2>
        <ol className="flex flex-col divide-y divide-line border-y border-line">
          {demoScenarios(new Date()).map((s, i) => (
            <li key={s.title} className="flex gap-3 py-3">
              <span aria-hidden className="w-5 shrink-0 text-base font-bold text-ink-muted">
                {i + 1}
              </span>
              {/* break-words: адрес /requests/С-… в «Изоляции» при тексте 200% на 360 */}
              <p className="min-w-0 text-base break-words text-ink">
                <span className="font-bold">{s.title}.</span> {s.how}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
