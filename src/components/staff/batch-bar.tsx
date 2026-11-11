"use client";

// Пакетная обработка очереди (T14+, ресерч деканату: «12 заявок — одно действие»). Чекбоксы стоят в строках
// очереди (серверные, data-batch-pick) — в форму не входят: React сбрасывает форму после действия, и выбор
// пропадал бы и при ошибке. Номера уходят скрытыми полями из диалога. По ux-reviewer T14+:
// — выбор по статусам («Выбрать «Подана» (2)») — строкой над списком: шаг вперёд у каждого статуса свой;
// — внизу липкая строка только при выборе — «Выбрано: 3» и глагол; шаблон и шаг — в диалоге;
// — итог — в живом регионе, фокус на нём (или на ошибке).
// Подтверждение — нативный <dialog> (Radix вставлял бы <style> без nonce — прод-CSP), как DialogForm.
import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { FormAlert } from "@/components/form-alert";
import { Button } from "@/components/ui/button";
import {
  BATCH_TARGETS,
  batchPhrase,
  previewTemplate,
  templatesFor,
  type BatchTarget,
} from "@/lib/reply-templates";
import { batchStatusAction, type BatchState } from "@/server/actions/staff";

const SELECT =
  "h-11 w-full rounded-lg border border-input bg-surface px-3 text-base font-normal text-ink";

const boxes = () =>
  Array.from(document.querySelectorAll<HTMLInputElement>("input[data-batch-pick]"));
const changed = () => document.dispatchEvent(new Event("change"));

// Отмеченные чекбоксы — внешнее для React состояние: читаем через useSyncExternalStore.
// Снимок — строка «всего;номер|статус,…»: сравнивается по значению, лишних перерисовок нет
function subscribe(onChange: () => void) {
  document.addEventListener("change", onChange);
  return () => document.removeEventListener("change", onChange);
}
const snapshot = () => {
  const all = boxes();
  return `${all.length};${all
    .filter((b) => b.checked)
    .map((b) => b.value)
    .join(",")}`;
};
const serverSnapshot = () => "0;";

function usePicked() {
  const snap = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [total, list] = snap.split(";") as [string, string];
  return { total: Number(total), picked: list ? list.split(",") : [] };
}

/** Над списком: выбрать (или снять) все заявки одного статуса — по одной кнопке на статус. */
export function BatchPicker({
  groups,
}: {
  groups: { status: string; label: string; count: number }[];
}) {
  const { picked } = usePicked();
  if (!groups.length) return null;
  const toggle = (status: string, all: boolean) => {
    for (const b of boxes()) if (b.value.endsWith(`|${status}`)) b.checked = !all;
    changed();
  };
  return (
    <div role="group" aria-label="Выбрать пачкой" className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-ink-muted">Пачкой:</span>
      {groups.map((g) => {
        const mine = picked.filter((v) => v.endsWith(`|${g.status}`)).length;
        const all = mine === g.count;
        return (
          <Button
            key={g.status}
            type="button"
            variant="outline"
            aria-pressed={all}
            className="h-auto min-h-11 max-w-full py-2 whitespace-normal"
            onClick={() => toggle(g.status, all)}
          >
            {all ? `Снять «${g.label}»` : `Выбрать «${g.label}» (${g.count})`}
          </Button>
        );
      })}
    </div>
  );
}

/** Под списком: итог (всегда в DOM — живой регион) и липкая строка, пока что-то выбрано. */
export function BatchBar({ forward }: { forward: Record<string, readonly BatchTarget[]> }) {
  const [state, action, pending] = useActionState<BatchState, FormData>(batchStatusAction, {});
  const { picked } = usePicked();
  const [to, setTo] = useState<BatchTarget | "">("");
  const [template, setTemplate] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // Ответ сервера: закрыть подтверждение; успех — снять выбор (строки уже перерисованы) и фокус на итог,
  // ошибка — выбор оставить, фокус на ошибку (иначе он падал на <body>: кнопки открытия больше нет)
  useEffect(() => {
    if (!state.ok && !state.error) return;
    dialogRef.current?.close();
    if (state.ok) {
      for (const b of boxes()) b.checked = false;
      changed();
    }
    resultRef.current?.querySelector<HTMLElement>("[data-result]")?.focus();
  }, [state]);

  // Выбор бывает смешанным: каждый шаг — со счётчиком тех, к кому он относится; по умолчанию — самый частый
  const statuses = picked.map((v) => v.split("|")[1]!);
  const fits = (t: BatchTarget) => statuses.filter((s) => forward[s]?.includes(t)).length;
  const options = BATCH_TARGETS.filter((t) => fits(t) > 0).sort((a, b) => fits(b) - fits(a));
  const target = to && options.includes(to) ? to : (options[0] ?? null);
  const applies = target ? fits(target) : 0;
  const others = picked.length - applies;
  const templates = target ? templatesFor(target) : [];
  const chosen =
    template === "none" ? null : (templates.find((t) => t.id === template) ?? templates[0] ?? null);
  const phrase = target ? batchPhrase(target, applies) : "";

  return (
    <>
      <div ref={resultRef} aria-live="polite">
        {state.ok && state.message ? (
          <p data-result tabIndex={-1} className="text-base font-bold text-ink outline-none">
            {state.message}
          </p>
        ) : null}
        {state.error ? (
          <div data-result tabIndex={-1} className="outline-none">
            <FormAlert title={state.error} />
          </div>
        ) : null}
      </div>

      {picked.length ? (
        // Одна строка: очередь над ней остаётся видна и на 360 при тексте 200 % (урок T11). На телефоне —
        // только кнопка во всю ширину (число уже в ней), «Выбрано» — для скринридера; снять — «Снять «…»» выше
        <div className="sticky bottom-0 z-30 flex items-center gap-x-4 border-t border-line bg-bg py-3">
          <p aria-live="polite" className="sr-only text-base text-ink sm:not-sr-only">
            Выбрано: <span className="font-bold tabular">{picked.length}</span>
          </p>
          {target ? (
            <Button
              type="button"
              aria-haspopup="dialog"
              className="h-auto min-h-11 w-full py-2 whitespace-normal sm:w-auto"
              onClick={() => dialogRef.current?.showModal()}
            >
              {phrase}…
            </Button>
          ) : (
            <p className="text-base text-ink">
              Для выбранных нет шага, который можно сделать пачкой.
            </p>
          )}
          <Button
            type="button"
            variant="ghost"
            className="hidden sm:inline-flex"
            onClick={() => {
              for (const b of boxes()) b.checked = false;
              changed();
            }}
          >
            Снять выбор
          </Button>
        </div>
      ) : null}

      <dialog
        ref={dialogRef}
        aria-labelledby="batch-dlg-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-0 text-ink backdrop:bg-black/50"
      >
        <form action={action} className="flex flex-col gap-4 p-5">
          <h2 id="batch-dlg-title" className="text-lg break-words">
            {phrase}?
          </h2>
          {/* В пачку — только те выбранные, к кому шаг относится */}
          {target
            ? picked
                .filter((v) => forward[v.split("|")[1]!]?.includes(target))
                .map((v) => <input key={v} type="hidden" name="pick" value={v} />)
            : null}
          {options.length > 1 ? (
            <label className="flex flex-col gap-1.5 text-sm font-bold text-ink">
              Шаг
              <select
                name="to"
                value={target ?? ""}
                onChange={(e) => setTo(e.target.value as BatchTarget)}
                className={SELECT}
              >
                {options.map((t) => (
                  <option key={t} value={t}>
                    {batchPhrase(t, fits(t))}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <input type="hidden" name="to" value={target ?? ""} />
          )}
          {others ? (
            <p className="text-base text-ink">
              Остальные выбранные ({others}) — с другим статусом, этот шаг их не касается.
            </p>
          ) : null}
          <label className="flex flex-col gap-1.5 text-sm font-bold text-ink">
            Ответ студентам
            <select
              name="template"
              value={chosen?.id ?? "none"}
              onChange={(e) => setTemplate(e.target.value)}
              className={SELECT}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
              <option value="none">Без комментария</option>
            </select>
          </label>
          <div className="flex flex-col gap-2 text-base text-ink">
            <p>Каждый студент получит уведомление{chosen ? ":" : " о новом статусе."}</p>
            {chosen ? (
              <p className="border-l-2 border-brand py-1 pl-3 break-words">
                {previewTemplate(chosen)}
              </p>
            ) : null}
            <p className="text-sm text-ink-muted">
              Название справки и срок подставим для каждой заявки сами. Отклонить пачкой нельзя —
              причина у каждой своя.
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-3 border-t border-line pt-3">
            <Button type="button" variant="ghost" onClick={() => dialogRef.current?.close()}>
              Не сейчас
            </Button>
            <Button
              type="submit"
              loading={pending}
              className="h-auto min-h-11 max-w-full py-2 whitespace-normal"
            >
              {phrase}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
