"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatCountdown } from "@/lib/dates";

// «через 25 мин» / «идёт, до конца 40 мин». Первое значение считает сервер (нет рассинхрона гидрации),
// дальше — раз в минуту в браузере. Пара закончилась — просим у сервера свежую ленту.
// Без aria-live: объявлять каждую минуту скринридером было бы шумом.
export function Countdown({
  startsAt,
  endsAt,
  initial,
}: {
  startsAt: string;
  endsAt: string;
  initial: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(initial);

  useEffect(() => {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    const tick = () => {
      const now = new Date();
      if (now >= end) {
        router.refresh();
        return;
      }
      setText(formatCountdown(start, end, now));
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [startsAt, endsAt, router]);

  return <span suppressHydrationWarning>{text}</span>;
}
