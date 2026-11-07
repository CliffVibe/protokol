"use client";

// Чат помощника (T12). История живёт только здесь, в памяти страницы: в БД её нет (решение человека 07.11),
// перезагрузка начинает разговор заново. На сервер уходят последние 6 реплик; кто спрашивает — сервер
// знает по сессии. Кнопки действий приходят с сервера готовыми (whitelist) — клиент адресов не собирает.
// Ответ модели рисуется Markdown без ссылок: переходы только кнопками (S8).
import { Info, RotateCw, Send, Square } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useEffect, useId, useRef, useState } from "react";
import { FormAlert } from "@/components/form-alert";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";

export const SUGGESTIONS = [
  "Когда следующий экзамен?",
  "Справка для военкомата",
  "Как оформить академ?",
  "Что с моими заявками?",
  "Как пересдать?",
] as const;

const MAX_HISTORY = 6;

/** Чип-вопрос: «С чего начать» и «Ещё по теме». py-2 — при тексте 200% строки не упираются в рамку */
const CHIP =
  "inline-flex min-h-[44px] max-w-full items-center rounded-full border border-border bg-surface px-4 py-2 text-left text-base break-words text-ink transition-colors duration-150 ease-out hover:border-brand hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";
const MAX_MESSAGE = 1000;

type Action = { id: string; label: string; href: string };
type Message =
  | { id: number; role: "user"; text: string }
  | {
      id: number;
      role: "assistant";
      text: string;
      status: "streaming" | "done" | "error";
      actions: Action[];
      notice?: string;
      related?: string[];
    };

type ServerEvent =
  | { t: "delta"; v: string }
  | { t: "done"; actions: Action[]; notice?: string; related?: string[] }
  | { t: "error" };

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Телефон и планшет: экранная клавиатура, Shift + Enter там нет (ux-reviewer T12) */
const coarsePointer = () => window.matchMedia("(pointer: coarse)").matches;

export function AssistantChat() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // Готовый ответ — один раз для скринридера (aria-busy у журнала читают не все: NVDA, VoiceOver)
  const [announcement, setAnnouncement] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastRef = useRef<HTMLLIElement>(null);
  const nextId = useRef(1);
  const inputId = useId();
  const hintId = useId();

  useEffect(() => () => abortRef.current?.abort(), []);

  const patchLast = (fn: (m: Extract<Message, { role: "assistant" }>) => Partial<Message>) =>
    setMessages((list) => {
      const last = list.at(-1);
      if (!last || last.role !== "assistant") return list;
      return [...list.slice(0, -1), { ...last, ...fn(last) } as Message];
    });

  async function ask(question: string, base: Message[]) {
    const text = question.trim().slice(0, MAX_MESSAGE);
    if (!text || busy) return;
    const user: Message = { id: nextId.current++, role: "user", text };
    const reply: Message = {
      id: nextId.current++,
      role: "assistant",
      text: "",
      status: "streaming",
      actions: [],
    };
    const history = [...base, user]
      .filter((m) => m.role === "user" || (m.status === "done" && m.text))
      .slice(-MAX_HISTORY)
      .map((m) => ({ role: m.role, content: m.text.slice(0, MAX_MESSAGE) }));
    setMessages([...base, user, reply]);
    setInput("");
    setBusy(true);
    setAnnouncement("");
    let answered = "";

    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: abort.signal,
      });
      // Сессия кончилась: сервер увёл на вход
      if (res.redirected && new URL(res.url).pathname === "/login") {
        router.push("/login");
        return;
      }
      if (!res.ok || !res.body) throw new Error("bad response");
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let finished = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as ServerEvent;
          if (e.t === "delta") {
            answered += e.v;
            patchLast((m) => ({ text: m.text + e.v }));
            // Первое слово ответа — показываем начало ответа (не низ страницы): дальше человек читает сам
            if (answered === e.v) scrollToAnswer();
          } else if (e.t === "done") {
            finished = true;
            patchLast(() => ({
              status: "done",
              actions: e.actions,
              notice: e.notice,
              related: e.related,
            }));
            setAnnouncement(`Помощник ответил. ${answered}${e.notice ? ` ${e.notice}` : ""}`);
          } else throw new Error("server error");
        }
      }
      if (!finished) throw new Error("cut");
    } catch {
      if (abort.signal.aborted && !answered) {
        // Остановили до первого слова — это не ошибка: убираем пару и возвращаем вопрос в поле
        setMessages(base);
        setInput(text);
        setAnnouncement("Ответ остановлен.");
      } else if (abort.signal.aborted) {
        patchLast(() => ({ status: "done", notice: "Ответ остановлен." }));
        setAnnouncement("Ответ остановлен.");
      } else {
        patchLast(() => ({ status: "error" }));
        setAnnouncement("Не получилось получить ответ.");
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      // На телефоне фокус в поле пролистал бы к нему и открыл клавиатуру поверх ответа
      if (!coarsePointer()) inputRef.current?.focus({ preventScroll: true });
    }
  }

  function scrollToAnswer() {
    requestAnimationFrame(() =>
      lastRef.current?.scrollIntoView({
        block: "start",
        behavior: reduceMotion() ? "auto" : "smooth",
      }),
    );
  }

  function newConversation() {
    setMessages([]);
    setAnnouncement("");
    inputRef.current?.focus({ preventScroll: true });
  }

  function retry() {
    // Последняя пара «вопрос — неудачный ответ» уходит, вопрос задаётся заново
    const lastUser = messages.findLast((m) => m.role === "user");
    if (!lastUser) return;
    const base = messages.slice(0, messages.lastIndexOf(lastUser));
    void ask(lastUser.text, base);
  }

  const last = messages.at(-1);

  return (
    <div className="flex flex-col gap-6">
      {messages.length === 0 ? (
        <section aria-labelledby={`${inputId}-tips`} className="flex flex-col gap-3">
          <h2 id={`${inputId}-tips`} className="text-lg font-bold text-ink">
            С чего начать
          </h2>
          <ul className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => void ask(s, messages)}
                  disabled={busy}
                  className={CHIP}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p role="status" className="sr-only">
        {announcement}
      </p>
      {/* Журнал без aria-live: ответ объявляет статус выше один раз, а не каждое слово и не свой же вопрос.
          role="log" — на обёртке: на самом <ol> он отнял бы роль списка (axe: listitem) */}
      <div
        role="log"
        aria-live="off"
        aria-busy={busy}
        aria-label="Разговор с помощником"
        className={messages.length ? undefined : "hidden"}
      >
        <ol className="flex flex-col">
          {messages.map((m, i) => (
            <li
              key={m.id}
              ref={i === messages.length - 1 ? lastRef : undefined}
              className="flex min-w-0 scroll-mb-40 flex-col gap-2 border-t border-line py-4"
            >
              <p className="text-sm font-bold text-ink-muted">
                {m.role === "user" ? "Вы" : "Помощник"}
              </p>
              {m.role === "user" ? (
                <p className="text-base break-words whitespace-pre-wrap text-ink">{m.text}</p>
              ) : m.status === "error" ? (
                <FormAlert title="Не получилось получить ответ" announce={false}>
                  Проверьте соединение и попробуйте ещё раз.
                </FormAlert>
              ) : m.text ? (
                <Markdown text={m.text} links={false} />
              ) : (
                <p className="text-base text-ink-muted">Помощник печатает…</p>
              )}
              {m.role === "assistant" && m.notice ? (
                <p className="flex gap-2 text-sm text-ink-muted">
                  <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <span className="break-words">{m.notice}</span>
                </p>
              ) : null}
              {m.role === "assistant" && m.status === "done" && m.actions.length ? (
                <ul className="flex flex-wrap gap-2 pt-1" aria-label="Перейти">
                  {m.actions.map((a) => (
                    <li key={a.id} className="max-w-full">
                      <Button
                        asChild
                        variant="outline"
                        className="h-auto min-h-[44px] whitespace-normal"
                      >
                        <Link href={a.href as Route}>{a.label}</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {m.role === "assistant" && m.status === "done" && m.related?.length ? (
                <div className="flex flex-col gap-2 pt-1">
                  <p className="text-sm font-bold text-ink-muted">Ещё по теме</p>
                  <ul className="flex flex-wrap gap-2">
                    {m.related.map((q) => (
                      <li key={q} className="max-w-full">
                        <button
                          type="button"
                          onClick={() => void ask(q, messages)}
                          disabled={busy}
                          className={CHIP}
                        >
                          {q}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {m.role === "assistant" && m.status === "error" && i === messages.length - 1 ? (
                <div>
                  <Button variant="outline" onClick={retry}>
                    <RotateCw aria-hidden data-icon="inline-start" />
                    Повторить
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      </div>

      <form
        className="flex flex-col gap-3 border-t border-line pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input, messages);
        }}
      >
        <label htmlFor={inputId} className="text-base font-bold text-ink">
          Ваш вопрос
        </label>
        <textarea
          ref={inputRef}
          id={inputId}
          name="question"
          rows={2}
          maxLength={MAX_MESSAGE}
          value={input}
          aria-describedby={hintId}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // На телефоне Enter — перенос строки, отправка — кнопкой «Спросить»
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing &&
              !coarsePointer()
            ) {
              e.preventDefault();
              void ask(input, messages);
            }
          }}
          placeholder="Например: какая справка нужна для визы?"
          className="min-h-[72px] w-full rounded-lg border border-input bg-surface px-3.5 py-2.5 text-base text-ink outline-none placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
        />
        <p id={hintId} className="text-sm text-ink-muted">
          <span className="hidden pointer-fine:inline">
            Enter — отправить, Shift + Enter — новая строка.{" "}
          </span>
          Помощник ничего не меняет сам — только подсказывает.
        </p>
        <div className="flex flex-wrap gap-3">
          {busy ? (
            <Button type="button" variant="outline" onClick={() => abortRef.current?.abort()}>
              <Square aria-hidden data-icon="inline-start" />
              Остановить
            </Button>
          ) : (
            <Button type="submit" disabled={!input.trim()} className="max-sm:w-full">
              <Send aria-hidden data-icon="inline-start" />
              Спросить
            </Button>
          )}
          {!busy && last?.role === "assistant" && last.status === "done" ? (
            <Button type="button" variant="ghost" onClick={newConversation} className="sm:ml-auto">
              Новый разговор
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
