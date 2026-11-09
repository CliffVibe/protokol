"use client";

// Лист с деталями пары (T06). Нативный <dialog>: ловушка фокуса, Esc и верхний слой — из коробки,
// без зависимостей; Radix Sheet вставлял бы <style> без nonce, и прод-CSP его заблокировал бы.
// Один диалог на страницу: строки только передают готовую модель (время уже по Москве).
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Languages, MapPin, UserRound, X } from "lucide-react";
import { CHANGE } from "@/components/now/labels";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LessonView } from "./lesson-view";

type Open = (lesson: LessonView, trigger: HTMLElement) => void;

const SheetContext = createContext<Open | null>(null);

export function LessonSheetProvider({ children }: { children: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const [lesson, setLesson] = useState<LessonView | null>(null);

  const open = useCallback<Open>((next, from) => {
    trigger.current = from;
    setLesson(next);
  }, []);

  useEffect(() => {
    const el = dialog.current;
    if (lesson && el && !el.open) el.showModal();
  }, [lesson]);

  const onClose = () => {
    setLesson(null);
    // Браузер обычно сам возвращает фокус, но не везде — возвращаем на строку явно
    trigger.current?.focus();
  };

  return (
    <SheetContext.Provider value={open}>
      {children}
      <dialog
        ref={dialog}
        aria-labelledby="lesson-sheet-title"
        onClose={onClose}
        // Касание по затемнению закрывает: цель клика — сам <dialog>, а не его содержимое
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-2xl border border-line bg-surface p-0 text-ink transition-[translate,opacity] duration-200 ease-out backdrop:bg-black/50 starting:translate-y-6 starting:opacity-0 md:inset-0 md:m-auto md:h-fit md:max-w-md md:rounded-2xl"
      >
        {lesson ? <SheetBody lesson={lesson} onClose={() => dialog.current?.close()} /> : null}
      </dialog>
    </SheetContext.Provider>
  );
}

function SheetBody({ lesson, onClose }: { lesson: LessonView; onClose: () => void }) {
  const change = lesson.change;
  return (
    <div className="flex flex-col gap-4 p-4 pb-6 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm text-ink-muted">{lesson.day}</p>
          <h2
            id="lesson-sheet-title"
            className={cn("text-lg break-words", lesson.cancelled && "text-ink-muted line-through")}
          >
            {lesson.title}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-[44px]"
          onClick={onClose}
          aria-label="Закрыть"
          autoFocus
        >
          <X aria-hidden className="size-5" />
        </Button>
      </div>

      <p
        className={
          lesson.cancelled
            ? "font-heading text-2xl font-semibold text-ink-muted tabular line-through"
            : "font-heading text-2xl font-semibold tabular"
        }
      >
        {lesson.start}
        <span className="text-lg text-ink-muted">–{lesson.end}</span>
      </p>

      {change ? (
        <div
          className={cn(
            "flex flex-col gap-1.5 border-l-4 pl-3 text-ink",
            lesson.cancelled ? "border-l-danger" : "border-l-warn",
          )}
        >
          <StatusChip tone={change.tone} icon={CHANGE[change.kind].icon} className="self-start">
            {change.label}
          </StatusChip>
          {change.was ? (
            <p className="text-base">
              {/* «было/стало» словами: перенос читается и без цвета */}
              Стало {lesson.start}, {change.was}
            </p>
          ) : null}
          {change.note ? <p className="text-base text-ink-muted">{change.note}</p> : null}
        </div>
      ) : null}

      <dl className="flex flex-col gap-3 text-base">
        <Detail icon={MapPin} term="Где">
          ауд. {lesson.room}, {lesson.building}
        </Detail>
        <Detail icon={UserRound} term="Кто ведёт">
          {lesson.teacher}
        </Detail>
        <Detail term="Тип занятия">{lesson.kind}</Detail>
        {lesson.language ? (
          <Detail icon={Languages} term="Языковая группа">
            {lesson.language}
          </Detail>
        ) : null}
      </dl>
    </div>
  );
}

function Detail({
  icon: Icon,
  term,
  children,
}: {
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      {Icon ? (
        <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
      ) : (
        <span aria-hidden className="size-5 shrink-0" />
      )}
      <div className="flex min-w-0 flex-col">
        <dt className="text-sm text-ink-muted">{term}</dt>
        <dd className="break-words">{children}</dd>
      </div>
    </div>
  );
}

/**
 * Название пары — кнопка, растянутая на всю строку (`after:inset-0`): касание по строке открывает лист,
 * а в списке остаются обычные элементы, а не одна большая кнопка с абзацами внутри.
 */
export function LessonOpenButton({
  lesson,
  className,
  children,
}: {
  lesson: LessonView;
  className?: string;
  children: React.ReactNode;
}) {
  const open = useContext(SheetContext);
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={(e) => open?.(lesson, e.currentTarget)}
      className={cn(
        "cursor-pointer text-left outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring",
        className,
      )}
    >
      {children}
    </button>
  );
}
