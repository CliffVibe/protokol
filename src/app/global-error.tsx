"use client";

import Link from "next/link";
import { CloudOff } from "lucide-react";
import { ConceptBanner } from "@/components/concept-banner";
import { LogoMark } from "@/components/logo-mark";
import "./globals.css";

// Последний рубеж: упал корневой layout. Next подменяет им весь документ — поэтому свои <html>/<body>
// и стили; тема — по системной настройке (класс из cookie сюда не доходит, см. доку Next по global-error).
// Вид — как у SystemPage (500), но без шрифтов из layout: их загружал упавший корень.
// Кнопка — обычная <button>, без style={{}}: прод-CSP режет inline-стили.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="ru">
      <body className="flex min-h-dvh flex-col bg-bg font-sans text-ink">
        <title>Ошибка · Протокол</title>
        <header className="border-b border-line px-4 md:px-6">
          <div className="mx-auto flex min-h-14 w-full max-w-[1120px] items-center gap-2.5">
            <LogoMark className="size-9" />
            <span className="font-heading text-base font-semibold">Протокол</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 pt-8 pb-10 md:px-6 lg:pt-14">
          <div className="flex max-w-2xl flex-col gap-6">
            <section className="flex gap-4 border-l-4 border-danger py-1 pl-4 text-danger">
              <CloudOff aria-hidden className="mt-1 size-[32px] shrink-0" />
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-sm text-ink-muted">Ошибка 500</p>
                <h1 className="text-xl break-words text-ink lg:text-2xl">Что-то пошло не так</h1>
              </div>
            </section>
            <p className="max-w-prose text-base text-ink-muted">
              Сбой на нашей стороне. Нажмите «Повторить»; если не помогает — зайдите через несколько
              минут.
            </p>
            {error.digest ? (
              <p className="text-sm text-ink-muted">
                Код ошибки: <span className="font-mono break-all text-ink">{error.digest}</span>.
                Если пишете в деканат — назовите его.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => retry()}
                className="min-h-[44px] rounded-xl bg-plate px-4 text-base font-bold text-on-plate focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Повторить
              </button>
              {/* Полная загрузка главной: корень упал, клиентский переход через него не нужен */}
              <Link
                href="/"
                className="inline-flex min-h-[44px] items-center rounded-xl border border-line bg-surface px-4 text-base font-bold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                На главную
              </Link>
            </div>
          </div>
        </main>
        <footer className="mx-auto w-full max-w-[1120px] px-4 pt-8 pb-6 md:px-6">
          <ConceptBanner />
        </footer>
      </body>
    </html>
  );
}
