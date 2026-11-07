// Подписка .ics (T11): формат RFC 5545 — то, на чём ломаются Google и iPhone. Плюс разбор токена и ссылки.
// Файл проверяем по содержимому: разворачиваем складывание и разбираем свойства обратно.
import { describe, expect, it } from "vitest";
import { calendarFeedUrls, parseCalendarSegment } from "@/lib/calendar-token";
import { buildCalendar, escapeText, foldLine, formatUtc } from "@/lib/ics";

const bytes = (s: string) => new TextEncoder().encode(s).length;
/** Развернуть сложенные строки (RFC 5545, 3.1) и разбить на «свойство → значения». */
function unfold(ics: string): string[] {
  return ics.replace(/\r\n /g, "").split("\r\n").filter(Boolean);
}

const TOKEN = "A".repeat(21) + "-_" + "z".repeat(20); // 43 символа base64url

describe("escapeText / foldLine", () => {
  it("экранирует \\ ; , и перевод строки", () => {
    expect(escapeText("а\\б;в,г\nд")).toBe("а\\\\б\\;в\\,г\\nд");
  });

  it("складывает по 75 байтам UTF-8, не разрывая кириллицу; склейка даёт исходник", () => {
    const line = `SUMMARY:${"Международные отношения ".repeat(8)}`;
    const folded = foldLine(line);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(bytes(p)).toBeLessThanOrEqual(75);
    for (const p of parts.slice(1)) expect(p.startsWith(" ")).toBe(true);
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(line);
    // Ни одного «битого» символа: каждая часть — валидный UTF-8 сама по себе
    for (const p of parts) expect(p).not.toContain("�");
  });

  it("короткую строку не трогает", () => {
    expect(foldLine("VERSION:2.0")).toBe("VERSION:2.0");
  });
});

describe("buildCalendar", () => {
  const now = new Date("2026-11-07T09:00:00Z");
  const ics = buildCalendar({
    name: "Протокол — расписание",
    refreshHours: 6,
    now,
    events: [
      {
        uid: "les-1@protokol",
        start: new Date("2026-11-09T06:00:00Z"),
        end: new Date("2026-11-09T07:30:00Z"),
        summary: "Микроэкономика — лекция",
        location: "ауд. 1052, Проспект Вернадского, 76",
        description: "Преподаватель: Иванова Н. П.\nПеренос (было 9 ноября, 09:00)",
      },
      {
        uid: "les-2@protokol",
        start: new Date("2026-11-10T06:00:00Z"),
        end: new Date("2026-11-10T07:30:00Z"),
        summary: "Отменена: Право — семинар",
        cancelled: true,
      },
    ],
  });
  const lines = unfold(ics);

  it("CRLF везде, файл кончается переводом строки", () => {
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("оболочка календаря и время в UTC", () => {
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines.at(-1)).toBe("END:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines).toContain("METHOD:PUBLISH");
    expect(lines).toContain("X-WR-CALNAME:Протокол — расписание");
    expect(lines).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT6H");
    expect(lines).toContain("DTSTART:20261109T060000Z");
    expect(lines).toContain("DTSTAMP:20261107T090000Z");
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(2);
    expect(lines.filter((l) => l === "END:VEVENT")).toHaveLength(2);
  });

  it("запятые в адресе и перевод строки в описании экранированы", () => {
    expect(lines).toContain("LOCATION:ауд. 1052\\, Проспект Вернадского\\, 76");
    expect(lines).toContain(
      "DESCRIPTION:Преподаватель: Иванова Н. П.\\nПеренос (было 9 ноября\\, 09:00)",
    );
  });

  it("отменённая пара — STATUS:CANCELLED, обычная — CONFIRMED", () => {
    expect(lines.filter((l) => l === "STATUS:CANCELLED")).toHaveLength(1);
    expect(lines.filter((l) => l === "STATUS:CONFIRMED")).toHaveLength(1);
  });

  it("formatUtc", () => {
    expect(formatUtc(new Date("2026-01-02T03:04:05.678Z"))).toBe("20260102T030405Z");
  });
});

describe("parseCalendarSegment", () => {
  it("принимает токен с .ics и без", () => {
    expect(parseCalendarSegment(`${TOKEN}.ics`)).toBe(TOKEN);
    expect(parseCalendarSegment(TOKEN)).toBe(TOKEN);
  });
  it("отклоняет короткий, длинный, мусор и не-строку", () => {
    expect(parseCalendarSegment(`${TOKEN.slice(1)}.ics`)).toBeNull();
    expect(parseCalendarSegment(`${TOKEN}A.ics`)).toBeNull();
    expect(parseCalendarSegment(`${TOKEN.slice(1)}/.ics`)).toBeNull();
    expect(parseCalendarSegment("../../etc/passwd")).toBeNull();
    expect(parseCalendarSegment(undefined)).toBeNull();
    expect(parseCalendarSegment(["a"])).toBeNull();
  });
});

describe("calendarFeedUrls", () => {
  it("https, webcal и Google собраны из одного адреса", () => {
    const u = calendarFeedUrls("https://protokol.example", TOKEN);
    expect(u.https).toBe(`https://protokol.example/api/calendar/${TOKEN}.ics`);
    expect(u.webcal).toBe(`webcal://protokol.example/api/calendar/${TOKEN}.ics`);
    expect(new URL(u.google).searchParams.get("cid")).toBe(u.webcal);
  });
});
