"use client";

// Офлайн-тост (T11, 04-design → «Офлайн»): плашка над нижней навигацией, пока нет сети.
// Иконка + текст — цвет не единственный носитель смысла; role="status" — скринридер прочтёт появление.
import { useEffect, useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** Есть ли сеть. На сервере — «есть»: плашка появляется только после гидратации, без расхождения HTML. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

export function OfflineBar({ children }: { children: React.ReactNode }) {
  // Пока плашка видна, футер получает запас снизу (globals.css → html[data-offline]): иначе в конце
  // прокрутки она закрывала бы плашку концепта, которая по правилам видна всегда (ux-reviewer T11)
  useEffect(() => {
    document.documentElement.dataset.offline = "";
    return () => {
      delete document.documentElement.dataset.offline;
    };
  }, []);
  return (
    <div
      role="status"
      // На ≥ 1024 — по центру колонки контента (справа от боковой панели w-64), а не окна
      className="fixed inset-x-4 bottom-[calc(var(--spacing-bottom-nav)+0.75rem)] z-40 mx-auto flex max-w-xl items-start gap-2 rounded-lg border border-warn/40 bg-surface px-4 py-3 text-sm text-ink shadow-lg lg:right-6 lg:bottom-6 lg:left-[calc(16rem+1.5rem)]"
    >
      <WifiOff aria-hidden className="mt-0.5 size-4 shrink-0 text-warn" />
      <p className="min-w-0 break-words">{children}</p>
    </div>
  );
}
