"use client";

// Страница входа стирает сохранённое офлайн-расписание (T11): после «Выйти» сюда приходят всегда,
// а на общем компьютере следующий человек без сети не должен увидеть чужие пары.
// Воркер стирает тот же кэш сам, когда видит редирект на /login (public/sw.js) — это вторая линия.
import { useEffect } from "react";

const PAGES_CACHE = "protokol-pages";

export function ClearOfflineData() {
  useEffect(() => {
    if (!("caches" in window)) return;
    caches.delete(PAGES_CACHE).catch(() => {
      // Хранилище недоступно (приватный режим) — значит, и стирать нечего
    });
    // И воркеру: он мог в эту секунду докачивать расписание — пусть не кладёт его обратно (sw.js → generation).
    // ready, а не controller: страница входа после выхода может быть ещё не под воркером
    navigator.serviceWorker?.ready
      .then((reg) => reg.active?.postMessage({ type: "clear" }))
      .catch(() => {});
  }, []);
  return null;
}
