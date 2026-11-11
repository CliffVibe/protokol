// Правила T09: объявление (поля, адресаты только своих факультетов), перенос пары, вкладки уведомлений.
import { describe, expect, it } from "vitest";
import { matchesAudience } from "@/lib/audience";
import { notificationsHref, parseTab } from "@/lib/notification-tabs";
import {
  announcementFormSchema,
  announcementNotification,
  buildAudience,
  clashMessage,
  describeAudience,
  newStartsAt,
  readAnnouncementForm,
  readRescheduleForm,
  rescheduleFormSchema,
  rescheduleNotification,
} from "@/server/services/staff-rules";

const msk = (iso: string) => new Date(`${iso}+03:00`);

const OPTIONS = {
  faculties: [{ code: "ФМО" }, { code: "МЭО" }],
  groups: [
    { name: "2МО-3", course: 2, facultyCode: "ФМО" },
    { name: "2МО-1", course: 2, facultyCode: "ФМО" },
    { name: "4МЭО-1", course: 4, facultyCode: "МЭО" },
  ],
};

const form = (over: Partial<Record<string, unknown>> = {}) =>
  announcementFormSchema.parse({
    title: "Заголовок",
    body: "Текст",
    faculties: [],
    courses: [],
    groups: [],
    pinned: false,
    ...over,
  });

describe("announcementFormSchema", () => {
  it("границы заголовка и текста", () => {
    const base = { faculties: [], courses: [], groups: [], pinned: false };
    expect(announcementFormSchema.safeParse({ ...base, title: "Аб", body: "x" }).success).toBe(
      false,
    );
    expect(announcementFormSchema.safeParse({ ...base, title: "Абв", body: "x" }).success).toBe(
      true,
    );
    expect(
      announcementFormSchema.safeParse({ ...base, title: "x".repeat(121), body: "x" }).success,
    ).toBe(false);
    expect(
      announcementFormSchema.safeParse({ ...base, title: "Абв", body: "x".repeat(4001) }).success,
    ).toBe(false);
    expect(announcementFormSchema.safeParse({ ...base, title: "Абв", body: "   " }).success).toBe(
      false,
    );
    expect(
      announcementFormSchema.safeParse({ ...base, title: "Абв", body: "x", courses: ["7"] })
        .success,
    ).toBe(false);
  });

  it("форма: чекбоксы — повторяющиеся имена", () => {
    const fd = new FormData();
    fd.set("title", "Т");
    fd.set("body", "Б");
    fd.append("faculty", "ФМО");
    fd.append("faculty", "МЭО");
    fd.append("course", "2");
    fd.set("pinned", "on");
    expect(readAnnouncementForm(fd)).toMatchObject({
      faculties: ["ФМО", "МЭО"],
      courses: ["2"],
      groups: [],
      pinned: true,
    });
  });
});

describe("buildAudience: только свои факультеты", () => {
  it("ничего не выбрано — все свои, а не «всем»", () => {
    expect(buildAudience(form(), OPTIONS)).toEqual({
      ok: true,
      audience: { facultyCodes: ["ФМО", "МЭО"] },
    });
  });

  it("чужой факультет из формы отбрасывается", () => {
    expect(buildAudience(form({ faculties: ["МЖ", "МЭО"] }), OPTIONS)).toEqual({
      ok: true,
      audience: { facultyCodes: ["МЭО"] },
    });
    // Только чужой — как «ничего не выбрано»: все свои, но не МЖ
    const onlyForeign = buildAudience(form({ faculties: ["МЖ"] }), OPTIONS);
    expect(onlyForeign.ok && onlyForeign.audience.facultyCodes).toEqual(["ФМО", "МЭО"]);
  });

  it("чужая группа отбрасывается; не подходящая под факультет или курс — ошибка", () => {
    const r = buildAudience(form({ faculties: ["ФМО"], groups: ["2МО-3", "1МЖ-1"] }), OPTIONS);
    expect(r).toEqual({ ok: true, audience: { facultyCodes: ["ФМО"], groupNames: ["2МО-3"] } });
    expect(buildAudience(form({ faculties: ["МЭО"], groups: ["2МО-3"] }), OPTIONS).ok).toBe(false);
    expect(buildAudience(form({ courses: [4], groups: ["2МО-3"] }), OPTIONS).ok).toBe(false);
  });

  it("нет своих факультетов — ошибка", () => {
    expect(buildAudience(form(), { faculties: [], groups: [] }).ok).toBe(false);
  });

  it("объявление для МЭО: Тимур — адресат, Алиса — нет (приёмка T09)", () => {
    const r = buildAudience(form({ faculties: ["МЭО"] }), OPTIONS);
    if (!r.ok) throw new Error(r.error);
    expect(
      matchesAudience(r.audience, { facultyCode: "МЭО", course: 4, groupName: "4МЭО-1" }),
    ).toBe(true);
    expect(matchesAudience(r.audience, { facultyCode: "ФМО", course: 2, groupName: "2МО-3" })).toBe(
      false,
    );
  });

  it("describeAudience — без «·»", () => {
    expect(
      describeAudience({ facultyCodes: ["ФМО", "МЭО"], courses: [2, 3], groupNames: ["2МО-3"] }),
    ).toBe("ФМО и МЭО, 2 и 3 курс, группа 2МО-3");
    expect(describeAudience({})).toBe("все факультеты");
    expect(describeAudience({ groupNames: ["2МО-3"] })).toBe("группа 2МО-3");
  });

  it("уведомление-объявление: короткий простой текст и ссылка на доску", () => {
    const n = announcementNotification({
      id: "ann-x",
      title: "Т",
      body: `**Важно:** ${"слово ".repeat(100)}`,
    });
    expect(n.kind).toBe("ANNOUNCEMENT");
    expect(n.body.startsWith("Важно: слово")).toBe(true);
    expect(n.body.length).toBeLessThanOrEqual(200);
    expect(n.link).toBe("/notifications?tab=announcements#announcement-ann-x");
  });
});

describe("перенос пары", () => {
  const now = msk("2026-11-06T09:00:00");
  const ok = {
    lessonId: "les-grp-3-2026-11-07-1",
    expectedStartsAt: "2026-11-07T06:10:00.000Z",
    date: "2026-11-09",
    time: "17:40",
    room: "",
    reason: "Преподаватель на конференции",
  };

  it("форма проходит, пустая аудитория — null", () => {
    const r = rescheduleFormSchema.parse(ok);
    expect(r.room).toBeNull();
    expect(+r.expectedStartsAt).toBe(+new Date(ok.expectedStartsAt));
    expect(newStartsAt(r, now)).toEqual({ ok: true, at: msk("2026-11-09T17:40:00") });
  });

  it("границы: время 08:00–21:00, причина 5–200, дата существует", () => {
    for (const bad of [
      { time: "07:55" },
      { time: "21:05" },
      { time: "25:00" },
      { reason: "нет" },
      { reason: "x".repeat(201) },
      { date: "2026-02-30" },
      { lessonId: "../etc" },
      { expectedStartsAt: "вчера" },
      { room: "x".repeat(21) },
    ])
      expect(rescheduleFormSchema.safeParse({ ...ok, ...bad }).success, JSON.stringify(bad)).toBe(
        false,
      );
    expect(rescheduleFormSchema.safeParse({ ...ok, time: "08:00" }).success).toBe(true);
    expect(rescheduleFormSchema.safeParse({ ...ok, time: "21:00" }).success).toBe(true);
  });

  it("в прошлое и дальше 30 дней — нельзя", () => {
    expect(
      newStartsAt(rescheduleFormSchema.parse({ ...ok, date: "2026-11-06", time: "08:30" }), now).ok,
    ).toBe(false);
    expect(newStartsAt(rescheduleFormSchema.parse({ ...ok, date: "2026-12-06" }), now).ok).toBe(
      true,
    );
    expect(newStartsAt(rescheduleFormSchema.parse({ ...ok, date: "2026-12-07" }), now).ok).toBe(
      false,
    );
  });

  it("форма читается из FormData", () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(ok)) fd.set(k, v);
    expect(rescheduleFormSchema.safeParse(readRescheduleForm(fd)).success).toBe(true);
  });

  it("уведомление группе: было → стало, причина, ссылка на день", () => {
    const n = rescheduleNotification(
      {
        discipline: "Эконометрика",
        from: msk("2026-11-07T09:10:00"),
        to: msk("2026-11-09T17:40:00"),
        building: "Главный корпус",
        room: "305",
        reason: "Преподаватель на конференции",
      },
      now,
    );
    expect(n.title).toBe("Перенос пары: Эконометрика");
    expect(n.body).toContain("завтра, 09:10 →");
    expect(n.body).toContain(
      "17:40, Главный корпус, ауд. 305. Причина: Преподаватель на конференции",
    );
    expect(n.link).toBe("/schedule?day=2026-11-09");
  });
});

describe("вкладки уведомлений", () => {
  it("битое значение — «Все»", () => {
    expect(parseTab("schedule")).toBe("schedule");
    for (const bad of [undefined, "", "ALL", ["schedule"], "../x"])
      expect(parseTab(bad)).toBe("all");
  });
  it("адрес вкладки", () => {
    expect(notificationsHref("all")).toBe("/notifications");
    expect(notificationsHref("deadlines")).toBe("/notifications?tab=deadlines");
  });
});

describe("накладки при переносе (T14+)", () => {
  const at = new Date("2026-11-12T09:40:00.000Z"); // 12:40 МСК
  const to = new Date("2026-11-12T11:00:00.000Z"); // 14:00 МСК
  it("группа, языковая, преподаватель — ошибка у поля «Начало» с временем помехи", () => {
    const g = clashMessage({ kind: "group", discipline: "Эконометрика", startsAt: at, endsAt: to });
    expect(g.field).toBe("time");
    expect(g.message).toBe(
      "У группы в это время уже пара: Эконометрика, 12:40–14:00. Выберите другое время",
    );
    expect(
      clashMessage({ kind: "language", students: 1, startsAt: at, endsAt: to }).message,
    ).toMatch(/^У одного студента группы в это время языковая пара/);
    expect(
      clashMessage({ kind: "language", students: 7, startsAt: at, endsAt: to }).message,
    ).toMatch(/^У 7 студентов группы/);
    const t = clashMessage({ kind: "teacher", startsAt: at, endsAt: to });
    expect(t).toEqual({
      field: "time",
      message: "У преподавателя в это время другая пара (12:40–14:00). Выберите другое время",
    });
  });
  it("склонение после числа: у 21 студента, у 22 студентов, у 11 студентов", () => {
    const lang = (students: number) =>
      clashMessage({ kind: "language", students, startsAt: at, endsAt: to }).message;
    expect(lang(21)).toMatch(/^У 21 студента группы/);
    expect(lang(22)).toMatch(/^У 22 студентов группы/);
    expect(lang(11)).toMatch(/^У 11 студентов группы/);
  });
  it("аудитория: ошибка у «Аудитории»; свободных нет — у «Начала»; без чужих групп и людей", () => {
    const room = {
      kind: "room" as const,
      building: "Главный корпус",
      room: "2029",
      startsAt: at,
      endsAt: to,
    };
    // Подсказка не загрузилась — не выдаём это за «свободных нет»
    expect(clashMessage(room)).toEqual({
      field: "room",
      message: "Ауд.\u00a02029 в это время занята. Укажите другую",
    });
    expect(clashMessage(room, 3)).toEqual({
      field: "room",
      message: "Ауд.\u00a02029 в это время занята. Выберите свободную ниже или впишите другую",
    });
    expect(clashMessage(room, 0)).toEqual({
      field: "time",
      message:
        "Ауд.\u00a02029 в это время занята, а свободных в корпусе по расписанию нет. Выберите другое время",
    });
  });
});
