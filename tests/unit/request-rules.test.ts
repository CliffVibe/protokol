// Правила заявок (T08): поля типа и zod-схема из них, номер, переходы, таймлайн, просрочка,
// тексты уведомлений, безопасная ссылка.
import { describe, expect, it } from "vitest";
import type { RequestStatus } from "@/generated/prisma/client";
import {
  buildPayloadSchema,
  canTransition,
  formatRequestNumber,
  notificationFor,
  overdueDays,
  parseFields,
  rejectReasonSchema,
  requestHref,
  requestNumberSchema,
  safeLink,
  timelineOf,
  TRANSITIONS,
  type FieldSpec,
} from "@/server/services/request-rules";

const msk = (iso: string) => new Date(`${iso}+03:00`);

const EMBASSY: FieldSpec[] = [
  { name: "country", label: "Страна", type: "text", required: true, maxLength: 80 },
  { name: "note", label: "Примечание", type: "text", required: false, maxLength: 10 },
  {
    name: "period",
    label: "Период",
    type: "select",
    required: true,
    options: ["3 месяца", "6 месяцев"],
  },
];

describe("parseFields — описание полей из БД тоже ввод", () => {
  it("правильное описание — как есть", () => {
    expect(parseFields(EMBASSY)).toEqual(EMBASSY);
  });
  it.each([
    ["не массив", { name: "x" }],
    ["неизвестный тип", [{ name: "x", label: "X", type: "file", required: true }]],
    ["без maxLength", [{ name: "x", label: "X", type: "text", required: true }]],
    [
      "select без вариантов",
      [{ name: "x", label: "X", type: "select", required: true, options: [] }],
    ],
    [
      "имя с подвохом",
      [{ name: "__proto__", label: "X", type: "text", required: true, maxLength: 5 }],
    ],
    [
      "повтор имени",
      [
        { name: "x", label: "X", type: "text", required: true, maxLength: 5 },
        { name: "x", label: "Y", type: "text", required: false, maxLength: 5 },
      ],
    ],
  ])("%s → null", (_, json) => {
    expect(parseFields(json)).toBeNull();
  });
});

describe("buildPayloadSchema — заявка из формы", () => {
  const schema = buildPayloadSchema(EMBASSY, ["ru", "en"]);

  it("правильная форма: обрезает пробелы, пустое необязательное не сохраняет, лишнее отбрасывает", () => {
    const r = schema.safeParse({
      language: "en",
      payload: { country: "  Италия ", note: "  ", period: "6 месяцев", studentId: "stu-alisa" },
    });
    expect(r.success && r.data).toEqual({
      language: "en",
      payload: { country: "Италия", period: "6 месяцев" },
    });
  });

  it("ошибки — у своих полей", () => {
    const r = schema.safeParse({
      language: "de",
      payload: { country: " ", note: "очень длинное примечание", period: "100 лет" },
    });
    expect(r.success).toBe(false);
    const issues = r.error!.issues.map((i) => [i.path.join("."), i.message]);
    expect(issues).toEqual(
      expect.arrayContaining([
        ["language", "Выберите язык справки"],
        ["payload.country", "Заполните поле"],
        ["payload.note", "Не длиннее 10 символов"],
        ["payload.period", "Выберите вариант"],
      ]),
    );
  });

  it("обязательное поле отсутствует совсем — «Заполните поле»", () => {
    const r = schema.safeParse({ language: "ru", payload: { period: "3 месяца" } });
    expect(r.error!.issues.map((i) => i.message)).toContain("Заполните поле");
  });

  it("один язык — можно не присылать, берётся он", () => {
    const one = buildPayloadSchema([], ["ru"]);
    expect(one.parse({ payload: {} })).toEqual({ language: "ru", payload: {} });
    expect(one.safeParse({ language: "en", payload: {} }).success).toBe(false);
  });
});

describe("номер заявки", () => {
  it("С-2026-00042 (кириллическая С), формат из адреса", () => {
    const n = formatRequestNumber(2026, 42);
    expect(n).toBe("С-2026-00042");
    expect(n.charCodeAt(0)).toBe(0x421);
    expect(requestNumberSchema.safeParse(n).success).toBe(true);
    // Набранная руками латинская C или строчная «с» — та же заявка (T14)
    for (const typed of ["C-2026-00042", "c-2026-00042", "с-2026-00042", " С-2026-00042 "]) {
      expect(requestNumberSchema.parse(typed), typed).toBe(n);
    }
    for (const bad of ["X-2026-00042", "СС-2026-00042", "С-2026-42", "С-2026-00042x", "../x", ""]) {
      expect(requestNumberSchema.safeParse(bad).success, bad).toBe(false);
    }
    expect(requestHref(n)).toBe(`/requests/${encodeURIComponent(n)}`);
  });
});

describe("переходы статусов", () => {
  const ALL: RequestStatus[] = [
    "SUBMITTED",
    "ACCEPTED",
    "IN_PROGRESS",
    "READY",
    "ISSUED",
    "REJECTED",
    "CANCELLED",
  ];
  const allowed = new Set([
    "SUBMITTED>ACCEPTED",
    "SUBMITTED>REJECTED",
    "ACCEPTED>IN_PROGRESS",
    "ACCEPTED>REJECTED",
    "IN_PROGRESS>READY",
    "IN_PROGRESS>REJECTED",
    "READY>ISSUED",
  ]);
  it("разрешены ровно 7 переходов, всё остальное — нет (включая назад и из финалов)", () => {
    for (const from of ALL)
      for (const to of ALL)
        expect(canTransition(from, to), `${from}>${to}`).toBe(allowed.has(`${from}>${to}`));
    expect(TRANSITIONS.CANCELLED).toEqual([]);
  });
  it("причина отклонения обязательна, 5–500 символов", () => {
    expect(rejectReasonSchema.safeParse("  ").success).toBe(false);
    expect(rejectReasonSchema.safeParse("Нет").success).toBe(false);
    expect(rejectReasonSchema.safeParse("Не указан район").success).toBe(true);
    expect(rejectReasonSchema.safeParse("x".repeat(501)).success).toBe(false);
  });
});

describe("timelineOf", () => {
  const created = msk("2026-11-06T09:00:00"); // пятница
  const ev = (status: RequestStatus, iso: string, comment: string | null = null) => ({
    status,
    createdAt: msk(iso),
    comment,
  });

  it("в работе: пройденные — с датой, текущий, будущие; срок — в рабочих днях", () => {
    const t = timelineOf({
      status: "ACCEPTED",
      createdAt: created,
      slaDays: 3,
      events: [
        ev("SUBMITTED", "2026-11-06T09:00:00"),
        ev("ACCEPTED", "2026-11-06T11:00:00", "Приняли"),
      ],
    });
    expect(t.steps.map((s) => [s.status, s.state])).toEqual([
      ["SUBMITTED", "done"],
      ["ACCEPTED", "current"],
      ["IN_PROGRESS", "upcoming"],
      ["READY", "upcoming"],
      ["ISSUED", "upcoming"],
    ]);
    expect(t.steps[1]!.comment).toBe("Приняли");
    // пт + 3 рабочих дня = ср
    expect(t.dueAt!.getTime()).toBeGreaterThanOrEqual(msk("2026-11-11T00:00:00").getTime());
    expect(t.dueAt!.getTime()).toBeLessThan(msk("2026-11-12T00:00:00").getTime());
    expect(t.end).toBeNull();
  });

  it("пропущенный шаг (сразу «В работе») — отмечен пройденным, без даты", () => {
    const t = timelineOf({
      status: "IN_PROGRESS",
      createdAt: created,
      slaDays: 5,
      events: [ev("SUBMITTED", "2026-11-06T09:00:00"), ev("IN_PROGRESS", "2026-11-07T09:00:00")],
    });
    expect(t.steps[1]).toMatchObject({ status: "ACCEPTED", state: "done", at: null });
  });

  it("отклонена: путь до места отклонения, финал с причиной, без срока и будущих шагов", () => {
    const t = timelineOf({
      status: "REJECTED",
      createdAt: created,
      slaDays: 3,
      events: [
        ev("SUBMITTED", "2026-11-06T09:00:00"),
        ev("REJECTED", "2026-11-07T10:00:00", "Не указан район"),
      ],
    });
    expect(t.steps.map((s) => [s.status, s.state])).toEqual([["SUBMITTED", "done"]]);
    expect(t.end).toEqual({
      status: "REJECTED",
      at: msk("2026-11-07T10:00:00"),
      comment: "Не указан район",
    });
    expect(t.dueAt).toBeNull();
  });

  it("готова и выдана — срок больше не показываем", () => {
    const base = {
      createdAt: created,
      slaDays: 3,
      events: [ev("SUBMITTED", "2026-11-06T09:00:00")],
    };
    expect(timelineOf({ ...base, status: "READY" }).dueAt).toBeNull();
    expect(timelineOf({ ...base, status: "ISSUED" }).steps.at(-1)!.state).toBe("current");
  });
});

describe("overdueDays", () => {
  const r = { createdAt: msk("2026-11-02T10:00:00"), slaDays: 2 }; // пн + 2 раб. = ср 04.11
  it("в работе и срок прошёл — дни просрочки по московскому календарю", () => {
    expect(overdueDays({ ...r, status: "SUBMITTED" }, msk("2026-11-04T23:00:00"))).toBe(0);
    expect(overdueDays({ ...r, status: "IN_PROGRESS" }, msk("2026-11-06T09:00:00"))).toBe(2);
  });
  it("готова, выдана, отклонена — не просрочена", () => {
    for (const status of ["READY", "ISSUED", "REJECTED", "CANCELLED"] as const)
      expect(overdueDays({ ...r, status }, msk("2026-12-01T09:00:00"))).toBe(0);
  });
});

describe("уведомления и ссылки", () => {
  it("тексты по статусу; отклонение — причина", () => {
    expect(notificationFor("READY", "Справка об обучении", null)).toEqual({
      title: "Справка готова",
      body: "Справка об обучении готова — заберите в деканате.",
    });
    expect(notificationFor("REJECTED", "Справка", "Не указан район").body).toBe("Не указан район");
  });
  it("safeLink: только относительный путь внутри сайта", () => {
    expect(safeLink("/requests/%D0%A1-2026-00001")).toBe("/requests/%D0%A1-2026-00001");
    for (const bad of [
      "javascript:alert(1)",
      "//evil.example",
      "/\\evil.example",
      "https://x",
      "/a b",
      null,
    ])
      expect(safeLink(bad), String(bad)).toBeNull();
  });
});
