// Генератор iCalendar (RFC 5545) для подписки на расписание (T11). Свой, без зависимостей: формат —
// простой текст, а нужное нам подмножество маленькое (VCALENDAR + VEVENT).
// Тонкости, на которых ломаются календари:
//  - строки через CRLF;
//  - строка не длиннее 75 БАЙТ (не символов): кириллица в UTF-8 — 2 байта, рвать посреди символа нельзя;
//    продолжение начинается с пробела;
//  - в тексте экранируются \ ; , и перевод строки.

export type IcsEvent = {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  location?: string;
  description?: string;
  cancelled?: boolean;
};

export type IcsCalendar = {
  name: string;
  /** Как часто клиенту перечитывать подписку, в часах */
  refreshHours: number;
  events: IcsEvent[];
  now: Date;
};

const CRLF = "\r\n";
const MAX_OCTETS = 75;
const encoder = new TextEncoder();

/** Текстовое значение свойства: \ ; , и перевод строки — экранируем (RFC 5545, 3.3.11). */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Складывание строки по 75 байтам UTF-8; продолжение — с пробела (он тоже считается). */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    const limit = parts.length === 0 ? MAX_OCTETS : MAX_OCTETS - 1;
    if (size + bytes > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += bytes;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

/** 2026-11-09T06:00:00.000Z → 20261109T060000Z */
export function formatUtc(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

export function buildCalendar({ name, refreshHours, events, now }: IcsCalendar): string {
  const stamp = formatUtc(now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Protokol//Digital Dean Office Concept//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    "X-WR-TIMEZONE:Europe/Moscow",
    `REFRESH-INTERVAL;VALUE=DURATION:PT${refreshHours}H`,
    `X-PUBLISHED-TTL:PT${refreshHours}H`,
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(e.uid)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${formatUtc(e.start)}`,
      `DTEND:${formatUtc(e.end)}`,
      `SUMMARY:${escapeText(e.summary)}`,
    );
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    lines.push(`STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`, "TRANSP:OPAQUE", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join(CRLF) + CRLF;
}
