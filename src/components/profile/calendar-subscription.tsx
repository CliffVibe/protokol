// «Расписание в календаре телефона» (T11, сценарий G): подписка .ics — пары сами появляются и обновляются
// в календаре телефона. Ссылка личная (токен 256 бит, S7): в ней только пары, но по ней видно расписание,
// поэтому рядом — «Перевыпустить ссылку». Одна заливная кнопка на экран — «Добавить в Google Календарь».
import { CalendarPlus, ChevronDown, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "./copy-button";
import { RotateLink } from "./rotate-link";

export function CalendarSubscription({
  urls,
  published,
}: {
  urls: { https: string; webcal: string; google: string };
  /** Сайт на https — Google и iPhone смогут прочитать ссылку; на localhost подписка не заработает */
  published: boolean;
}) {
  return (
    <section
      aria-labelledby="calendar-title"
      className="flex flex-col gap-4 border-t border-line pt-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id="calendar-title" className="text-lg">
          Расписание в календаре телефона
        </h2>
        <p className="max-w-[40rem] text-base text-ink">
          Пары появятся в календаре телефона и будут обновляться сами — переносы и отмены тоже.
          Оценок и личных данных в подписке нет.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        {/* whitespace-normal: при тексте 200% подпись переносится, а не растягивает экран (ux-reviewer T11) */}
        <Button asChild className="h-auto max-w-full min-h-11 py-2 text-left whitespace-normal">
          <a href={urls.google} target="_blank" rel="noopener noreferrer">
            <CalendarPlus aria-hidden data-icon="inline-start" />
            Добавить в Google Календарь
            <ExternalLink aria-hidden data-icon="inline-end" />
            <span className="sr-only"> (откроется в новой вкладке)</span>
          </a>
        </Button>
        {/* webcal — Календарь Apple; на Android ссылка ничего не делает, поэтому подпись — про Apple */}
        <Button
          asChild
          variant="outline"
          className="h-auto max-w-full min-h-11 py-2 text-left whitespace-normal"
        >
          <a href={urls.webcal}>Добавить в Apple Календарь (iPhone, Mac)</a>
        </Button>
      </div>
      {published ? null : (
        <p className="text-sm text-ink-muted">
          Это локальная копия сайта: календари подключатся к ссылке, когда сайт будет опубликован.
        </p>
      )}

      <div className="flex max-w-[40rem] flex-col gap-2">
        <p className="text-sm text-ink-muted">Ссылка для других календарей:</p>
        <code
          data-testid="calendar-url"
          className="rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm break-all text-ink"
        >
          {urls.https}
        </code>
        <CopyButton value={urls.https} label="Скопировать ссылку" />
      </div>

      <details className="group max-w-[40rem] rounded-lg border border-line">
        {/* Свой шеврон: у summary с flex системный треугольник пропадает, и блок похож на поле */}
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 px-3 text-base font-bold text-ink [&::-webkit-details-marker]:hidden">
          Как подписаться
          <ChevronDown
            aria-hidden
            className="size-5 shrink-0 text-ink-muted transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="flex flex-col gap-3 px-3 pb-3 text-base text-ink">
          <div>
            <h3>iPhone и iPad</h3>
            <p>
              Нажмите «Добавить в Apple Календарь» и подтвердите «Подписаться». Или: Настройки →
              Календарь → Учётные записи → Добавить → Другое → Подписной календарь → вставьте
              ссылку.
            </p>
          </div>
          <div>
            <h3>Android</h3>
            <p>
              Нажмите «Добавить в Google Календарь» и войдите в свой аккаунт Google — расписание
              появится в приложении «Google Календарь» на телефоне. Если не видно: в приложении Меню
              → Настройки → «Протокол — расписание» → «Синхронизация».
            </p>
          </div>
          <div>
            <h3>Google Календарь на компьютере</h3>
            <p>
              «Другие календари» → «+» → «Добавить по URL» → вставьте ссылку. Google обновляет
              подписки сам, обычно раз в несколько часов.
            </p>
          </div>
        </div>
      </details>

      <div className="flex max-w-[40rem] flex-col gap-2">
        <p className="text-sm text-ink">
          Ссылка личная: по ней видно ваше расписание. Если отправили её кому-то — перевыпустите.
        </p>
        <RotateLink />
      </div>
    </section>
  );
}
