"use client";

// PWA в оболочке студента (T11): регистрирует service worker (public/sw.js) и показывает офлайн-плашку
// на всех экранах, кроме расписания (у него своя — со временем сохранения, OfflineSchedule).
// Только в прод-сборке: в dev кэш чанков ломал бы горячую замену кода.
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { OfflineBar, useOnline } from "./offline-bar";

export function PwaShell() {
  const online = useOnline();
  const pathname = usePathname();

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Не зарегистрировался (приватный режим, старый браузер) — сайт работает как обычно, без офлайна
    });
  }, []);

  if (online || pathname === "/schedule") return null;
  return (
    <OfflineBar>Нет сети — без интернета открывается только сохранённое расписание.</OfflineBar>
  );
}
