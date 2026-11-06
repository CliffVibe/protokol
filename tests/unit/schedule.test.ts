// Расписание (T06): раскладка по дням, переходы между корпусами, модель строки.
import { describe, expect, it } from "vitest";
import { toLessonView } from "@/components/schedule/lesson-view";
import { buildTransitions, groupByDay, weekChanges } from "@/server/services/schedule";
import type { LessonRow } from "@/server/repos/schedule";

const msk = (iso: string) => new Date(`${iso}+03:00`);
const MAIN = "Главный корпус (пр-т Вернадского)";
const ODI = "Одинцово";

let seq = 0;
function lesson(start: string, end: string, over: Partial<LessonRow> = {}): LessonRow {
  seq += 1;
  return {
    id: `l${seq}`,
    kind: "SEMINAR",
    startsAt: msk(start),
    endsAt: msk(end),
    building: MAIN,
    room: "2118",
    change: "NONE",
    changeNote: null,
    originalStartsAt: null,
    discipline: { name: "Дипломатический протокол" },
    teacher: { fullName: "Орлова Н. В." },
    languageGroup: null,
    ...over,
  };
}

// Понедельник 9 ноября 2026
const WEEK = msk("2026-11-09T00:00:00");

describe("groupByDay", () => {
  it("пн–сб всегда, даже пустые; воскресенье без пар не показываем", () => {
    const days = groupByDay([lesson("2026-11-12T09:00:00", "2026-11-12T10:20:00")], WEEK);
    expect(days.map((d) => d.key)).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
    ]);
    expect(days[3]!.items).toHaveLength(1);
    expect(days[0]!.items).toEqual([]);
  });

  it("воскресенье с парами показываем («сегодня» у Алисы — всегда учебный день)", () => {
    const days = groupByDay([lesson("2026-11-15T09:00:00", "2026-11-15T10:20:00")], WEEK);
    expect(days.at(-1)!.key).toBe("2026-11-15");
  });

  it("день — по Москве: пара в 01:00 МСК (22:00 UTC накануне) — в своём дне", () => {
    const days = groupByDay([lesson("2026-11-10T01:00:00", "2026-11-10T02:00:00")], WEEK);
    expect(days[1]!.items).toHaveLength(1);
  });

  it("пары внутри дня — по фактическому времени (перенесённая — на новом месте)", () => {
    const moved = lesson("2026-11-09T17:40:00", "2026-11-09T19:00:00", {
      change: "MOVED",
      originalStartsAt: msk("2026-11-09T09:00:00"),
    });
    const second = lesson("2026-11-09T10:40:00", "2026-11-09T12:00:00");
    const [mon] = groupByDay([moved, second], WEEK);
    expect(mon!.items.map((i) => i.lesson.id)).toEqual([second.id, moved.id]);
  });
});

describe("buildTransitions — «Переход между корпусами»", () => {
  it("как четверг у 2МО-3: туда и обратно, перерыв 20 мин", () => {
    const a = lesson("2026-11-12T09:00:00", "2026-11-12T10:20:00");
    const b = lesson("2026-11-12T10:40:00", "2026-11-12T12:00:00", { building: ODI });
    const c = lesson("2026-11-12T12:40:00", "2026-11-12T14:00:00");
    const t = buildTransitions([c, a, b]);
    expect(t.get(b.id)).toEqual({ from: MAIN, to: ODI, breakMinutes: 20 });
    expect(t.get(c.id)).toEqual({ from: ODI, to: MAIN, breakMinutes: 40 });
    expect(t.has(a.id)).toBe(false);
  });

  it("в одном корпусе перехода нет", () => {
    const t = buildTransitions([
      lesson("2026-11-12T09:00:00", "2026-11-12T10:20:00"),
      lesson("2026-11-12T10:40:00", "2026-11-12T12:00:00"),
    ]);
    expect(t.size).toBe(0);
  });

  it("отменённая пара не считается: на неё не идут", () => {
    const a = lesson("2026-11-12T09:00:00", "2026-11-12T10:20:00");
    const cancelled = lesson("2026-11-12T10:40:00", "2026-11-12T12:00:00", {
      building: ODI,
      change: "CANCELLED",
    });
    const c = lesson("2026-11-12T12:40:00", "2026-11-12T14:00:00");
    expect(buildTransitions([a, cancelled, c]).size).toBe(0);
  });
});

describe("weekChanges", () => {
  it("только изменения, по времени", () => {
    const later = lesson("2026-11-13T09:00:00", "2026-11-13T10:20:00", { change: "CANCELLED" });
    const plain = lesson("2026-11-10T09:00:00", "2026-11-10T10:20:00");
    const earlier = lesson("2026-11-11T09:00:00", "2026-11-11T10:20:00", {
      change: "ROOM_CHANGED",
    });
    expect(weekChanges([later, plain, earlier]).map((l) => l.id)).toEqual([earlier.id, later.id]);
  });
});

describe("toLessonView", () => {
  const now = msk("2026-11-12T11:00:00");

  it("обычная пара: время, день, тип; идёт сейчас", () => {
    const v = toLessonView(lesson("2026-11-12T10:40:00", "2026-11-12T12:00:00"), now);
    expect(v).toMatchObject({
      start: "10:40",
      end: "12:00",
      day: "Четверг, 12 ноября",
      kind: "Семинар",
      language: null,
      change: null,
      cancelled: false,
      ongoing: true,
    });
  });

  it("языковая пара — бейдж языка", () => {
    const v = toLessonView(
      lesson("2026-11-12T14:20:00", "2026-11-12T15:40:00", {
        kind: "LANGUAGE",
        languageGroup: { name: "Англ. B2-4" },
      }),
      now,
    );
    expect(v.kind).toBe("Иностранный язык");
    expect(v.language).toBe("Англ. B2-4");
  });

  it("перенос в тот же день — «было 09:00» и причина отдельно", () => {
    const v = toLessonView(
      lesson("2026-11-12T17:40:00", "2026-11-12T19:00:00", {
        change: "MOVED",
        originalStartsAt: msk("2026-11-12T09:00:00"),
        changeNote: "Преподаватель на конференции",
      }),
      now,
    );
    expect(v.change).toEqual({
      kind: "MOVED",
      label: "Перенос",
      tone: "warn",
      was: "было 09:00",
      note: "Преподаватель на конференции",
    });
  });

  it("перенос с другого дня — «было вчера, 09:00»", () => {
    const v = toLessonView(
      lesson("2026-11-12T17:40:00", "2026-11-12T19:00:00", {
        change: "MOVED",
        originalStartsAt: msk("2026-11-11T09:00:00"),
      }),
      now,
    );
    expect(v.change?.was).toBe("было вчера, 09:00");
  });

  it("отмена: не «идёт сейчас», даже если время совпало", () => {
    const v = toLessonView(
      lesson("2026-11-12T10:40:00", "2026-11-12T12:00:00", { change: "CANCELLED" }),
      now,
    );
    expect(v.cancelled).toBe(true);
    expect(v.ongoing).toBe(false);
    expect(v.change).toMatchObject({ label: "Отмена", tone: "danger", was: null });
  });

  it("смена аудитории — без «было», с причиной", () => {
    const v = toLessonView(
      lesson("2026-11-13T09:00:00", "2026-11-13T10:20:00", {
        change: "ROOM_CHANGED",
        changeNote: "Была 3045",
        room: "4012",
      }),
      now,
    );
    expect(v.change).toMatchObject({ label: "Другая аудитория", was: null, note: "Была 3045" });
    expect(v.room).toBe("4012");
  });
});
