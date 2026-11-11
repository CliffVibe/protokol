import "server-only";
import { parseActions, toActions, type AssistantAction } from "@/lib/assistant-actions";
import { formatTime } from "@/lib/dates";
import type { StudentCtx } from "@/server/auth/guards";
import { reserveAiCall, type AiCallSlot } from "@/server/repos/assistant";
import { publishedAnswers } from "@/server/repos/faq-entries";
import { deanAnswerCaption } from "@/server/services/faq-rules";
import { buildStudentContext, contextToText } from "./context";
import { deanArticle, loadFaq, searchFaq, type FaqArticle, type FaqHit } from "./faq";
import { createGigaChat, GigaChatError } from "./gigachat";
import { answerFromData, asksAboutOtherPerson, REFUSAL } from "./intents";
import { createLineGate } from "./line-gate";
import { buildMessages } from "./prompt";
import { chooseProvider, serverEnv, type AiProvider } from "./provider";

// Ответ помощника (T12, S8). Порядок:
//  1) контекст ТОЛЬКО текущего студента (ctx из сессии);
//  2) вопрос о другом человеке → отказ сразу, без модели;
//  3) есть ИИ → занять вызов (20 в час); лимит или сбой GigaChat → ответ по базе с пометкой;
//  4) ответ модели идёт потоком, строка «ДЕЙСТВИЯ:» придерживается и в чат не попадает;
//     кнопки — только id из whitelist (lib/assistant-actions.ts), адресов модель не пишет.
// Модель ничего не меняет: у неё нет инструментов, ответ — просто текст.

export type HistoryMessage = { role: "user" | "assistant"; content: string };

export type AssistantEvent =
  | { t: "delta"; v: string }
  | {
      t: "done";
      mode: "ai" | "faq";
      actions: AssistantAction[];
      notice?: string;
      /** «Ещё по теме» — заголовки статей FAQ; клиент рисует их чипами, касание задаёт вопрос (ux-reviewer T12) */
      related?: string[];
    };

export type AnswerDeps = {
  now?: Date;
  /** undefined — по окружению; null — без ИИ; объект — свой провайдер (тесты: «эхо») */
  provider?: AiProvider | null;
  reserve?: (ctx: StudentCtx, now: Date) => Promise<AiCallSlot>;
  faq?: FaqArticle[];
};

let gigachat: { key: string; provider: AiProvider } | null = null;

/** Один экземпляр на процесс — чтобы OAuth-токен (30 мин) переиспользовался между запросами. */
export function defaultProvider(): AiProvider | null {
  const choice = chooseProvider(serverEnv());
  if (choice.kind === "faq") return null;
  if (gigachat?.key !== choice.authKey) {
    gigachat = { key: choice.authKey, provider: createGigaChat(choice) };
  }
  return gigachat.provider;
}

/**
 * T14+: база знаний из заявок — опубликованные ответы деканата, свежим запросом (файловый кэш не трогаем).
 * Сбой базы не мешает ответить по статьям с диска.
 */
async function deanArticles(ctx: StudentCtx): Promise<FaqArticle[]> {
  return publishedAnswers(ctx)
    .then((rows) => rows.map(deanArticle))
    .catch(() => []);
}

/** Ответ по базе: сначала свои данные по правилам, затем лучшая статья, иначе — честное «не знаю». */
export function faqAnswer(
  question: string,
  ctx: Parameters<typeof answerFromData>[1],
  hits: FaqHit[],
): { text: string; actions: AssistantAction[]; related?: string[] } {
  const rule = answerFromData(question, ctx);
  if (rule) return rule;
  const top = hits[0];
  if (top) {
    const related = hits.slice(1).map((h) => h.article.title);
    // Ответ деканата из базы знаний — с подписью и датой: видно, что это ответ людей, а не статья
    const caption = top.article.deanAt ? ["", `*${deanAnswerCaption(top.article.deanAt)}*`] : [];
    return {
      text: [`**${top.article.title}**`, "", top.article.body, ...caption].join("\n"),
      actions: toActions(top.article.actions),
      ...(related.length ? { related } : {}),
    };
  }
  return {
    text: "Не нашёл ответа в базе деканата. Попробуйте спросить иначе — например, «справка для визы», «академ», «пересдача». Или задайте вопрос сотруднику: заявка с целью «Другое».",
    actions: toActions(["request_other"]),
  };
}

function log(mode: string, started: number, code?: string) {
  // Без текста вопроса, имени и id: только режим, длительность и код сбоя (03-architecture, «Логи без ПДн»)
  console.info(
    JSON.stringify({
      event: "assistant",
      mode,
      ms: Date.now() - started,
      ...(code ? { code } : {}),
    }),
  );
}

export async function* answer(
  ctx: StudentCtx,
  history: HistoryMessage[],
  signal: AbortSignal,
  deps: AnswerDeps = {},
): AsyncGenerator<AssistantEvent> {
  const started = Date.now();
  const now = deps.now ?? new Date();
  const question = history.at(-1)?.content ?? "";
  const context = await buildStudentContext(ctx, now);
  if (!context) throw new Error("assistant: нет студента");

  if (asksAboutOtherPerson(question, context)) {
    log("refusal", started);
    yield { t: "delta", v: REFUSAL };
    yield { t: "done", mode: "faq", actions: [] };
    return;
  }

  const hits = searchFaq(deps.faq ?? [...loadFaq(), ...(await deanArticles(ctx))], question);
  const provider = deps.provider === undefined ? defaultProvider() : deps.provider;
  let notice: string | undefined;

  if (provider) {
    const slot = await (deps.reserve ?? reserveAiCall)(ctx, now);
    if (!slot.ok) {
      notice = `Лимит ИИ — 20 вопросов в час. До ${formatTime(slot.retryAt)} отвечаю по базе ответов деканата.`;
    } else {
      const gate = createLineGate();
      let full = "";
      let sent = false;
      try {
        for await (const piece of provider.stream(
          buildMessages(contextToText(context), hits, history),
          signal,
        )) {
          full += piece;
          const out = gate.push(piece);
          if (out) {
            sent = true;
            yield { t: "delta", v: out };
          }
        }
        const tail = gate.flush();
        if (tail) yield { t: "delta", v: tail };
        const parsed = parseActions(full);
        if (parsed.text) {
          log("ai", started);
          yield { t: "done", mode: "ai", actions: parsed.actions };
          return;
        }
        notice = "ИИ не ответил — отвечаю по базе ответов деканата.";
      } catch (e) {
        const code = e instanceof GigaChatError ? e.code : "error";
        if (signal.aborted) {
          log("aborted", started);
          return;
        }
        log("ai_error", started, code);
        if (sent) {
          yield {
            t: "done",
            mode: "ai",
            actions: [],
            notice: "Ответ оборвался. Попробуйте спросить ещё раз.",
          };
          return;
        }
        notice = "ИИ сейчас недоступен — отвечаю по базе ответов деканата.";
      }
    }
  }

  const fallback = faqAnswer(question, context, hits);
  log("faq", started);
  yield { t: "delta", v: fallback.text };
  yield {
    t: "done",
    mode: "faq",
    actions: fallback.actions,
    ...(notice ? { notice } : {}),
    ...(fallback.related ? { related: fallback.related } : {}),
  };
}
