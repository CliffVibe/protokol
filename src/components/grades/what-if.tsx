"use client";

// «Что если…» (T11, сценарий «Как дела с учёбой»): студент выбирает, как планирует сдать дисциплины
// текущего семестра без итога, и сразу видит, сохранится ли стипендия после сессии. Ничего не сохраняется —
// пересчёт на клиенте тем же правилом, что и на сервере (src/lib/scholarship.ts), без дублирования.
// Выбор — нативные радио (работают с клавиатуры и скринридером); «Не знаю» — значение по умолчанию.
// Радио неуправляемые, выбор читается из самой формы: касание до гидратации (медленный телефон) уже
// отметило кнопку в DOM — при монтировании форма прочитается, и итог совпадёт с видимым выбором.
import { useEffect, useMemo, useRef, useState } from "react";
import { ShieldCheck, ShieldX } from "lucide-react";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { plural } from "@/lib/dates";
import {
  isPending,
  picksPassFail,
  projectSession,
  type GradeRow,
  type SessionPick,
  type SessionProjection,
} from "@/lib/scholarship";
import { cn } from "@/lib/utils";
import { ASSESSMENT_KIND } from "./labels";

type Option = { value: string; label: string; srLabel?: string; pick: SessionPick | null };

const UNKNOWN: Option = { value: "unknown", label: "Не знаю", pick: null };

const MARK_OPTIONS: Option[] = [
  UNKNOWN,
  { value: "5", label: "5", srLabel: "отлично", pick: { mark: 5 } },
  { value: "4", label: "4", srLabel: "хорошо", pick: { mark: 4 } },
  { value: "3", label: "3", srLabel: "удовлетворительно", pick: { mark: 3 } },
  { value: "2", label: "2", srLabel: "неудовлетворительно", pick: { mark: 2 } },
];

const PASS_OPTIONS: Option[] = [
  UNKNOWN,
  { value: "pass", label: "Зачтено", pick: { passed: true } },
  { value: "fail", label: "Не зачтено", pick: { passed: false } },
];

const PICK_BY_VALUE = new Map(
  [...MARK_OPTIONS, ...PASS_OPTIONS].map((o) => [o.value, o.pick] as const),
);
const fieldName = (disciplineId: string) => `what-if-${disciplineId}`;

const KEPT = "После сессии стипендия сохранится";
// Прогноз на следующий семестр: долг или тройка в этой сессии — стипендию не назначат (T14: «под угрозой»
// осталось только для рейтинга текущего семестра, в прогнозе его ещё нет)
const THREAT = "После сессии стипендию не назначат";

/** «Без выбора 3 дисциплины: считаем, что сдадите их на 4 и выше». */
function unpickedText(unpicked: number, picked: number): string {
  if (picked === 0) return "Пока ничего не выбрано: считаем, что всё сдадите на 4 и выше.";
  const word = plural(unpicked, ["дисциплина", "дисциплины", "дисциплин"]);
  return `Без выбора ${unpicked} ${word}: считаем, что сдадите ${unpicked === 1 ? "её" : "их"} на 4 и выше.`;
}

const formatAverage = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });

export function WhatIf({ grades, semester }: { grades: GradeRow[]; semester: number }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [picks, setPicks] = useState<Record<string, SessionPick>>({});
  const pending = useMemo(
    () =>
      grades
        .filter((g) => g.semester === semester && isPending(g))
        .sort((a, b) => a.discipline.name.localeCompare(b.discipline.name, "ru")),
    [grades, semester],
  );
  const projection = useMemo(
    () => projectSession(grades, semester, picks),
    [grades, semester, picks],
  );
  const picked = Object.keys(picks).length;

  /** Выбор — из формы: что отмечено в DOM, то и считаем. */
  function readForm() {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const next: Record<string, SessionPick> = {};
    for (const g of pending) {
      const pick = PICK_BY_VALUE.get(String(data.get(fieldName(g.discipline.id)) ?? ""));
      if (pick) next[g.discipline.id] = pick;
    }
    setPicks(next);
  }

  // Касания до гидратации — подхватить при монтировании
  useEffect(readForm, [pending]);

  function reset() {
    formRef.current?.reset();
    setPicks({});
  }

  const outcome = <Outcome projection={projection} picked={picked} />;
  const resetButton =
    picked > 0 ? (
      <Button
        type="button"
        variant="ghost"
        className="-ml-3 min-h-[44px] self-start"
        onClick={reset}
      >
        Сбросить
      </Button>
    ) : null;

  return (
    <section
      id="what-if"
      aria-labelledby="what-if-title"
      className="flex scroll-mt-6 flex-col gap-4 border-t border-line pt-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id="what-if-title" className="text-lg">
          Что если…
        </h2>
        <p className="text-base text-ink-muted">
          Выберите, как планируете сдать сессию. Ничего не сохраняется — это только прикидка.
        </p>
      </div>

      <form
        ref={formRef}
        onChange={readForm}
        onSubmit={(e) => e.preventDefault()}
        aria-label="Прикидка итогов сессии"
        className="flex flex-col"
      >
        {/* ≥ 1024: итог над списком — и в DOM первым, чтобы порядок Tab совпадал с видимым */}
        <div className="hidden lg:flex lg:flex-col lg:gap-2 lg:pb-2">
          {outcome}
          {resetButton}
        </div>

        <ul aria-label="Дисциплины без итога" className="flex flex-col divide-y divide-line">
          {pending.map((g) => (
            <li key={g.discipline.id} className="py-4">
              <fieldset className="flex flex-col gap-2">
                <legend className="text-base font-bold break-words text-ink">
                  {g.discipline.name}
                </legend>
                <p className="text-sm text-ink-muted">
                  {ASSESSMENT_KIND[g.kind]}
                  {g.ratingPoints !== null ? (
                    <>
                      , сейчас <span className="tabular">{g.ratingPoints}</span> из 100
                    </>
                  ) : null}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(picksPassFail(g.kind) ? PASS_OPTIONS : MARK_OPTIONS).map((o) => (
                    <label
                      key={o.value}
                      className={cn(
                        "inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-lg border border-line px-3 text-base text-ink transition-colors",
                        "hover:border-ink-muted has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                        "has-[:checked]:border-2 has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:font-bold has-[:checked]:text-brand",
                      )}
                    >
                      <input
                        type="radio"
                        name={fieldName(g.discipline.id)}
                        value={o.value}
                        defaultChecked={o === UNKNOWN}
                        className="sr-only"
                      />
                      {o.label}
                      {o.srLabel ? <span className="sr-only">, {o.srLabel}</span> : null}
                    </label>
                  ))}
                </div>
              </fieldset>
            </li>
          ))}
        </ul>

        {/* Телефон: пока выбираешь, над нижней навигацией прилипает только значок итога, а причины,
            средний и «Сбросить» идут обычным блоком под списком: при тексте 200% липкий итог целиком
            закрывал экран (ux-reviewer T11). Под списком значок встаёт на место — над причинами. */}
        {/* Прямой потомок формы: sticky держится только в пределах родителя, а родитель — вся форма.
            Значок дублирует итог ниже — для скринридера он скрыт */}
        <div
          aria-hidden
          className="sticky bottom-bottom-nav z-10 -mx-4 border-t border-line bg-bg px-4 py-3 md:-mx-6 md:px-6 lg:hidden"
        >
          <OutcomeChip kept={projection.scholarship.kept} />
        </div>
        <div className="flex flex-col gap-2 lg:hidden">
          <Outcome projection={projection} picked={picked} chip={false} />
          {resetButton}
        </div>
      </form>
    </section>
  );
}

/**
 * Итог прикидки — живой регион: значок, причины, средний и допущение о невыбранных.
 * Средний «по выбранным», пока есть невыбранные: иначе «3» спорило бы с «остальные на 4 и выше»
 * в той же строке (ux-reviewer T11).
 */
function Outcome({
  projection,
  picked,
  chip = true,
}: {
  projection: SessionProjection;
  picked: number;
  /** false — значок уже виден в липкой полосе над ним (телефон): здесь только текст для скринридера */
  chip?: boolean;
}) {
  const { scholarship, average, unpicked } = projection;
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-1.5">
      {chip ? (
        <OutcomeChip kept={scholarship.kept} />
      ) : (
        <p className="sr-only">{scholarship.kept ? KEPT : THREAT}</p>
      )}
      {scholarship.kept ? null : (
        <ul aria-label="Причины" className="list-disc pl-5 text-sm text-ink">
          {scholarship.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <p className="text-sm text-ink">
        {average !== null ? (
          <>
            {unpicked > 0 ? "Средний балл по выбранным" : "Средний балл сессии"}:{" "}
            <span className="font-bold tabular">{formatAverage(average)}</span>.{" "}
          </>
        ) : null}
        {unpicked > 0 ? (
          <span className="text-ink-muted">{unpickedText(unpicked, picked)}</span>
        ) : null}
      </p>
    </div>
  );
}

function OutcomeChip({ kept }: { kept: boolean }) {
  return kept ? (
    <StatusChip tone="ok" icon={ShieldCheck} className="self-start">
      {KEPT}
    </StatusChip>
  ) : (
    // Прогноз «не назначат» — тот же статус, что «Стипендия не назначена» выше: danger и ShieldX (ux-reviewer, T14)
    <StatusChip tone="danger" icon={ShieldX} className="self-start">
      {THREAT}
    </StatusChip>
  );
}
