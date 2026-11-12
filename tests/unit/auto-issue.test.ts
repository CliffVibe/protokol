// «Справка за 10 секунд» (T14+): когда кабинет выдаёт справку сам, а когда — исключение к сотруднику.
import { describe, expect, it } from "vitest";
import { SEED_AUTO_COMMENT } from "../../prisma/seed-data";
import {
  AUTO_EVENT_COMMENT,
  AUTO_ISSUE_LIMIT,
  autoIssueDecision,
  autoIssueHint,
  exceptionComment,
} from "@/server/services/auto-issue-rules";

const base = { debts: 0, recentAuto: 0 };

describe("автовыдача справки об обучении", () => {
  it("пустой или типовой адресат → выдать сразу, адресат подставлен стандартный", () => {
    expect(autoIssueDecision({ ...base, typeCode: "study_ru", payload: {} })).toEqual({
      auto: true,
      payload: { addressee: "По месту требования" },
    });
    expect(
      autoIssueDecision({
        ...base,
        typeCode: "study_ru",
        payload: { addressee: "  по  месту ТРЕБОВАНИЯ " },
      }),
    ).toEqual({ auto: true, payload: { addressee: "По месту требования" } });
    expect(
      autoIssueDecision({
        ...base,
        typeCode: "study_en",
        payload: { addressee: "to whom it may concern" },
      }),
    ).toEqual({ auto: true, payload: { addressee: "To whom it may concern" } });
  });

  it("свой текст адресата — к сотруднику: он попадёт в справку", () => {
    const d = autoIssueDecision({
      ...base,
      typeCode: "study_ru",
      payload: { addressee: "В банк" },
    });
    expect(d).toMatchObject({
      auto: false,
      reason: expect.stringContaining("свой адресат попадёт в текст справки"),
    });
    // Лишнее поле (подделка формы) — тоже не автомат
    expect(
      autoIssueDecision({ ...base, typeCode: "study_ru", payload: { addressee: "", note: "x" } })
        .auto,
    ).toBe(false);
  });

  it("долг или лимит за месяц — к сотруднику, с причиной", () => {
    expect(
      autoIssueDecision({ typeCode: "study_ru", payload: {}, debts: 1, recentAuto: 0 }),
    ).toMatchObject({
      auto: false,
      reason: expect.stringContaining("долг по сессии"),
    });
    expect(
      autoIssueDecision({
        typeCode: "study_ru",
        payload: {},
        debts: 0,
        recentAuto: AUTO_ISSUE_LIMIT,
      }),
    ).toMatchObject({ auto: false, reason: "за 30 дней вы уже получили сразу 3 такие справки" });
    expect(
      autoIssueDecision({
        typeCode: "study_ru",
        payload: {},
        debts: 0,
        recentAuto: AUTO_ISSUE_LIMIT - 1,
      }).auto,
    ).toBe(true);
  });

  it("остальные типы (виза, военкомат…) — всегда сотрудник, без причины-исключения", () => {
    for (const typeCode of ["embassy", "military", "social", "retake", "scholarship_up"])
      expect(autoIssueDecision({ ...base, typeCode, payload: {} })).toEqual({
        auto: false,
        reason: null,
      });
  });

  it("подсказка в форме — только у типов, которые кабинет выдаёт сам; комментарий исключения", () => {
    expect(autoIssueHint("study_ru")).toContain("«По месту требования»");
    expect(autoIssueHint("study_en")).toContain("«To whom it may concern»");
    expect(autoIssueHint("embassy")).toBeNull();
    expect(exceptionComment("есть долг")).toBe("Посмотрит сотрудник: есть долг.");
  });

  it("сид пишет те же комментарии шагов, что и сервис", () => {
    expect(SEED_AUTO_COMMENT).toEqual(AUTO_EVENT_COMMENT);
  });
});
