// T14+: инструменты деканата — утренний брифинг, пакетная обработка с шаблонами, база знаний из заявок.
// Чистые функции: подсчёты брифинга, шаблоны ответа, схема пакета, обезличивание и черновик ответа.
import { describe, expect, it } from "vitest";
import {
  BATCH_TARGETS,
  previewTemplate,
  REPLY_TEMPLATES,
  renderTemplate,
  templatesFor,
} from "@/lib/reply-templates";
import { deanArticle, searchFaq } from "@/server/services/ai/faq";
import {
  deanAnswerCaption,
  draftFromRequest,
  faqEntryFormSchema,
  personalLeft,
  redactPersonal,
  suggestKeywords,
} from "@/server/services/faq-rules";
import {
  BATCH_MAX,
  batchFormSchema,
  isDueToday,
  readBatchForm,
  summarizeBriefing,
} from "@/server/services/request-rules";

const msk = (iso: string) => new Date(`${iso}+03:00`);
const NOW = msk("2026-11-12T09:30"); // четверг

describe("утренний брифинг", () => {
  const item = (over: Partial<Parameters<typeof summarizeBriefing>[0][number]> = {}) => ({
    status: "SUBMITTED" as const,
    overdue: 0,
    dueAt: msk("2026-11-16T12:00"),
    createdAt: msk("2026-11-10T12:00"),
    ...over,
  });

  it("горят: просрочены или срок сегодня; готовы; новые со вчерашнего утра; черновики", () => {
    const b = summarizeBriefing(
      [
        item({ overdue: 2 }),
        item({ dueAt: msk("2026-11-12T18:00") }), // срок сегодня
        item({ status: "IN_PROGRESS", dueAt: msk("2026-11-13T10:00") }),
        item({ status: "READY", dueAt: msk("2026-11-12T10:00") }), // готова — не «горит»
        item({ status: "READY" }),
        item({ createdAt: msk("2026-11-11T08:00") }), // вчера — новая
        item({ status: "ACCEPTED", createdAt: msk("2026-11-12T08:00") }), // принята — уже не новая
      ],
      2,
      NOW,
      5,
    );
    // autoIssued — «Кабинет сам выдал…» (T14+): число из репозитория, сводка его только передаёт
    expect(b).toEqual({ urgent: 2, overdue: 1, ready: 2, fresh: 1, drafts: 2, autoIssued: 5 });
  });

  it("пусто — все нули", () => {
    expect(summarizeBriefing([], 0, NOW)).toEqual({
      urgent: 0,
      overdue: 0,
      ready: 0,
      fresh: 0,
      drafts: 0,
      autoIssued: 0,
    });
  });

  it("срок сегодня — только у ждущих действия и не просроченных", () => {
    const today = msk("2026-11-12T17:00");
    expect(isDueToday({ status: "IN_PROGRESS", overdue: 0, dueAt: today }, NOW)).toBe(true);
    expect(isDueToday({ status: "READY", overdue: 0, dueAt: today }, NOW)).toBe(false);
    expect(isDueToday({ status: "SUBMITTED", overdue: 1, dueAt: today }, NOW)).toBe(false);
  });
});

describe("шаблоны ответа для пачки", () => {
  it("у каждого шага вперёд есть шаблон; отклонения пачкой нет", () => {
    for (const to of BATCH_TARGETS) expect(templatesFor(to).length).toBeGreaterThan(0);
    expect(BATCH_TARGETS).not.toContain("REJECTED");
  });

  it("подстановки: название справки, срок, часы выдачи — без «{…}» в итоге", () => {
    for (const t of REPLY_TEMPLATES) {
      const text = renderTemplate(t, {
        typeTitle: "Справка об обучении",
        dueAt: msk("2026-11-13T10:00"),
        now: NOW,
      });
      expect(text).not.toMatch(/[{}]/);
    }
    const ready = REPLY_TEMPLATES.find((t) => t.id === "ready-pickup")!;
    const text = renderTemplate(ready, {
      typeTitle: "Справка об обучении",
      dueAt: NOW,
      now: NOW,
    });
    expect(text).toContain("«Справка об обучении» готова");
    expect(text).toContain("по четвергам — до 19:00");
  });

  it("срок прошёл — не пишем дату из прошлого; срок сегодня — «сегодня»", () => {
    const due = REPLY_TEMPLATES.find((t) => t.id === "accept-due")!;
    const r = (dueAt: Date) => renderTemplate(due, { typeTitle: "Справка", dueAt, now: NOW });
    expect(r(msk("2026-11-10T10:00"))).toContain("в ближайший рабочий день");
    expect(r(msk("2026-11-12T08:00"))).toContain("Срок готовности — сегодня");
    expect(r(msk("2026-11-13T08:00"))).toContain("Срок готовности — завтра");
  });

  it("превью для подтверждения показывает метки, а не чужие данные", () => {
    const t = REPLY_TEMPLATES.find((x) => x.id === "accept-due")!;
    expect(previewTemplate(t)).toContain("‹название справки›");
  });
});

describe("схема пакета", () => {
  const fd = (picks: string[], to: string, template = "none") => {
    const f = new FormData();
    for (const p of picks) f.append("pick", p);
    f.set("to", to);
    f.set("template", template);
    return readBatchForm(f);
  };
  const ok = "С-2026-00012|SUBMITTED";

  it("разбирает «номер|статус» и шаблон, подходящий к действию", () => {
    const r = batchFormSchema.parse(fd([ok, "С-2026-00013|ACCEPTED"], "ACCEPTED", "accept-due"));
    expect(r.picks).toEqual([
      { number: "С-2026-00012", from: "SUBMITTED" },
      { number: "С-2026-00013", from: "ACCEPTED" },
    ]);
  });

  it("отказ: пусто, дубли, больше лимита, отклонение, чужой шаблон, битый номер", () => {
    expect(batchFormSchema.safeParse(fd([], "ACCEPTED")).success).toBe(false);
    expect(batchFormSchema.safeParse(fd([ok, ok], "ACCEPTED")).success).toBe(false);
    const many = Array.from(
      { length: BATCH_MAX + 1 },
      (_, i) => `С-2026-${String(i + 1).padStart(5, "0")}|SUBMITTED`,
    );
    expect(batchFormSchema.safeParse(fd(many, "ACCEPTED")).success).toBe(false);
    expect(batchFormSchema.safeParse(fd([ok], "REJECTED")).success).toBe(false);
    expect(batchFormSchema.safeParse(fd([ok], "ACCEPTED", "ready-pickup")).success).toBe(false);
    expect(batchFormSchema.safeParse(fd(["1; DROP TABLE|SUBMITTED"], "ACCEPTED")).success).toBe(
      false,
    );
    expect(batchFormSchema.safeParse(fd(["С-2026-00012|ISSUED"], "ACCEPTED")).success).toBe(false);
  });
});

describe("обезличивание ответа сотрудника", () => {
  const igor = { lastName: "Савельев", firstName: "Игорь", middleName: "Андреевич" };

  it("ФИО в падежах, обращение в начале убирается без «…, »", () => {
    const r = redactPersonal(
      "Игорь, справка готова. Передайте Савельеву Игорю, что Игоря ждём в 2104.",
      igor,
    );
    expect(r.text).toBe("Справка готова. Передайте … …, что … ждём в 2104.");
    expect(r.removed).toEqual(["name"]);
  });

  it("номер заявки, зачётка, группа, телефон, e-mail, ссылка, длинный номер", () => {
    const r = redactPersonal(
      "По заявке С-2026-00042 (зачётка 24-МО-0311, группа 2МО-1) звоните +7 (495) 123-45-67 " +
        "или 8 495 123 45 67, пишите ivan@example.ru, форма https://example.ru/x, договор 123456789.",
    );
    for (const leak of ["С-2026", "24-МО", "2МО-1", "123-45", "123 45", "@", "https", "123456789"])
      expect(r.text).not.toContain(leak);
    expect(new Set(r.removed)).toEqual(
      new Set(["number", "recordBook", "group", "phone", "email", "link", "digits"]),
    );
  });

  it("«е» и «ё» — одна буква; короткие имена на гласную — в падежах (T14)", () => {
    const vera = { lastName: "Королёва", firstName: "Вера", middleName: null };
    const r = redactPersonal(
      "Королева Вера, передайте Вере и Королевой: справку для Веры заберёт Верой названный брат.",
      vera,
    );
    for (const leak of ["Королев", "Вер"]) expect(r.text).not.toContain(leak);
    const ilya = { lastName: "Зайцев", firstName: "Илья", middleName: null };
    expect(redactPersonal("Для Ильи справка, с Ильёй согласовали, Илье напишем.", ilya).text).toBe(
      "Для … справка, с … согласовали, … напишем.",
    );
    // Похожее слово не задевает: «верный», «вероятно»
    expect(redactPersonal("Верный срок, вероятно, 2 дня.", vera).text).toBe(
      "Верный срок, вероятно, 2 дня.",
    );
  });

  it("номер заявки с латинской C тоже убирается", () => {
    expect(redactPersonal("По заявке C-2026-00042 готово").text).toBe("По заявке … готово");
  });

  it("обычный текст не портит: даты, сроки, кабинет, слова, похожие на имя", () => {
    const text =
      "Справку делаем за 1–2 дня, кабинет 2104, приём до 19:00 по четвергам. Игорный бизнес.";
    expect(redactPersonal(text, { lastName: "Ян", firstName: "Ян", middleName: null }).text).toBe(
      text,
    );
  });

  it("черновик из заявки: имя убрано, ключевые слова — тип справки и слова ответа", () => {
    const d = draftFromRequest({
      typeTitle: "Справка в посольство",
      comment:
        "Игорь, справка готова. Для визы во Францию консульству достаточно справки на английском. " +
        "Перевод на французский деканат не делает — нужен нотариальный перевод.",
      student: igor,
    });
    expect(d.body).not.toMatch(/Игор/);
    expect(d.body.startsWith("Справка готова.")).toBe(true);
    expect(d.removed).toEqual(["name"]);
    expect(d.keywords.startsWith("справка в посольство, ")).toBe(true);
    expect(d.keywords).toContain("перевод");
  });

  it("ключевые слова без служебных и не больше лимита", () => {
    const k = suggestKeywords("Справка", "нужно нужно нужно перевод перевод консульство", 2);
    expect(k).toBe("справка, перевод, консульство");
  });

  it("перед публикацией: личное, которое сотрудник вернул правкой, ловится", () => {
    const f = { title: "Нужен ли перевод?", keywords: "перевод", body: "Игорь, перевод не нужен." };
    expect(personalLeft(f, igor)).toEqual(["name"]);
    expect(personalLeft({ ...f, body: "Перевод не нужен." }, igor)).toEqual([]);
    expect(personalLeft({ ...f, body: "Звоните 8-495-123-45-67" }, null)).toEqual(["phone"]);
  });

  it("форма: вопрос, ключевые слова и ответ обязательны, лимиты", () => {
    const base = {
      id: "faq-typo",
      title: "Нужен ли перевод справки для визы?",
      keywords: "перевод, виза",
      body: "Нет: достаточно справки на английском.",
      intent: "publish",
    };
    expect(faqEntryFormSchema.safeParse(base).success).toBe(true);
    expect(faqEntryFormSchema.safeParse({ ...base, title: "Виза?" }).success).toBe(false);
    expect(faqEntryFormSchema.safeParse({ ...base, body: "x".repeat(2001) }).success).toBe(false);
    expect(faqEntryFormSchema.safeParse({ ...base, intent: "drop" }).success).toBe(false);
    expect(faqEntryFormSchema.safeParse({ ...base, id: "../x" }).success).toBe(false);
  });
});

describe("ответ деканата в поиске помощника", () => {
  const entry = deanArticle({
    id: "abc",
    title: "Нужен ли перевод справки для визы во Францию?",
    keywords: "перевод справки, виза, франция, консульство",
    body: "Нет: консульству достаточно справки на английском.",
    publishedAt: msk("2026-11-11T15:00"),
  });

  it("находится по словам студента, ключевые слова — по запятым", () => {
    expect(entry.keywords).toEqual(["перевод справки", "виза", "франция", "консульство"]);
    const hits = searchFaq([entry], "нужен ли перевод справки на французский для визы");
    expect(hits[0]?.article.slug).toBe("dean-abc");
  });

  it("подпись с датой публикации", () => {
    expect(deanAnswerCaption(msk("2026-11-11T15:00"))).toBe("Ответ деканата от 11 ноября");
  });
});
