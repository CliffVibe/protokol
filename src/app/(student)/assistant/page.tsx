import type { Metadata } from "next";
import { AssistantChat } from "@/components/assistant/chat";
import { PageHeader } from "@/components/page-header";
import { requireStudent } from "@/server/auth/guards";
import { aiConfigured } from "@/server/services/ai/provider";

export const metadata: Metadata = { title: "Помощник" };

// ИИ-помощник (T12, S8). Доступ — requireStudent() первой строкой (CLAUDE.md → «Железные правила»).
// В клиент уходит только «есть ли ИИ» (да/нет) — ни ключа, ни данных студента: их сервер добавит сам
// к каждому вопросу в /api/assistant.
export default async function AssistantPage() {
  await requireStudent();
  const ai = aiConfigured();
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Помощник"
        description="Ответит на вопросы о правилах деканата и ваших данных: расписании, оценках, заявках."
      />
      {/* Сноска того же вида, что плашка концепта, но без role="note": роль note на странице — только у неё (shell.spec) */}
      <p className="border-l-2 border-brand py-1 pl-3 text-sm break-words text-ink">
        {ai
          ? "Ответы ИИ могут быть неточны. Важное проверяйте в разделах кабинета."
          : "Сейчас отвечаю по базе ответов деканата, без ИИ. Важное проверяйте в разделах кабинета."}
      </p>
      <AssistantChat />
    </div>
  );
}
