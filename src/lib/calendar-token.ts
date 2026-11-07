import { z } from "zod";

/** Токен подписки на расписание: 32 случайных байта в base64url — ровно 43 символа (S7, T11). */
export const calendarTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/**
 * Сегмент адреса `/api/calendar/<token>.ics` → токен или null. Суффикс `.ics` необязателен
 * (папка `[token].ics` — недопустимый динамический сегмент, поэтому отрезаем здесь).
 */
export function parseCalendarSegment(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const parsed = calendarTokenSchema.safeParse(raw.endsWith(".ics") ? raw.slice(0, -4) : raw);
  return parsed.success ? parsed.data : null;
}

/** Адрес подписки для календаря (https — для Google и «копировать», webcal — для iPhone). */
export function calendarFeedUrls(origin: string, token: string) {
  const https = `${origin}/api/calendar/${token}.ics`;
  const webcal = https.replace(/^https?:/, "webcal:");
  return {
    https,
    webcal,
    // Google Календарь принимает подписку по webcal-адресу в параметре cid; это же путь для Android
    google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`,
  };
}
