"use client";

// Расписание без сети (T11). Две задачи:
//  1. Отдать service worker адреса расписания на две недели (их считает сервер — offlineScheduleUrls)
//     и файлы уже открытой страницы: первый визит прошёл до того, как воркер начал работать.
//  2. Без сети — плашка «показываем сохранённое расписание» со временем, когда страница была получена:
//     savedAt лежит в самой странице, поэтому у копии из кэша он прежний — видно, насколько данные старые.
//     «Сегодня в 01:13» считаем на клиенте и только без сети: отформатированное на сервере «сегодня»
//     у копии из кэша со временем стало бы неправдой (ux-reviewer T11).
import { useEffect } from "react";
import { formatDayMonth, formatRelativeDay, formatTime } from "@/lib/dates";
import { OfflineBar, useOnline } from "./offline-bar";

/** «сегодня в 01:13», «вчера в 22:40», «5 ноября в 22:40». */
export function savedLabel(savedAt: Date, now: Date): string {
  const day = formatRelativeDay(savedAt, now);
  const when = day === "сегодня" || day === "вчера" ? day : formatDayMonth(savedAt);
  return `${when} в ${formatTime(savedAt)}`;
}

export function OfflineSchedule({ urls, savedAt }: { urls: string[]; savedAt: string }) {
  const online = useOnline();

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    navigator.serviceWorker.ready.then((reg) => {
      if (cancelled || !navigator.onLine) return;
      const assets = performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .filter((name) => new URL(name).pathname.startsWith("/_next/static/"));
      reg.active?.postMessage({ type: "cache-schedule", urls, assets });
    });
    return () => {
      cancelled = true;
    };
  }, [urls]);

  if (online) return null;
  return (
    <OfflineBar>
      Нет сети — показываем сохранённое расписание. Обновлено{" "}
      {savedLabel(new Date(savedAt), new Date())}.
    </OfflineBar>
  );
}
