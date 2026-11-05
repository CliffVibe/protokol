"use client";

import { CONCEPT_NOTICE } from "@/components/concept-banner";
import "./globals.css";

// Последний рубеж: упал корневой layout. Next подменяет им весь документ — поэтому свои <html>/<body>
// и стили; тема — по системной настройке (класс из cookie сюда не доходит, см. доку Next по global-error).
export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="ru">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg px-4 text-center font-sans text-ink">
        <title>Ошибка · Протокол</title>
        <h1 className="text-h2">Что-то пошло не так</h1>
        <p className="max-w-sm text-body text-ink-muted">
          Попробуйте ещё раз. Если не помогает — зайдите чуть позже.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="min-h-11 rounded-lg bg-brand px-4 text-small font-medium text-bg"
        >
          Повторить
        </button>
        <p role="note" className="max-w-md rounded-xl bg-brand-soft px-4 py-3 text-small text-ink">
          {CONCEPT_NOTICE}
        </p>
      </body>
    </html>
  );
}
