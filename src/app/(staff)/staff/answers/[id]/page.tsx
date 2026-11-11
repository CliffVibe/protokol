import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Eraser } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/page-header";
import { FaqEntryForm } from "@/components/staff/faq-entry-form";
import { formatRelativeDay } from "@/lib/dates";
import { requireStaff } from "@/server/auth/guards";
import {
  deanAnswerCaption,
  faqEntryIdSchema,
  REMOVED,
  removedKindSchema,
} from "@/server/services/faq-rules";
import { getFaqEntry } from "@/server/services/faq-entries";
import { staffRequestHref } from "@/server/services/request-rules";

// Ответ помощника (T14+): редактор черновика или опубликованного ответа своего факультета (S1).
// Своего loading.tsx нет намеренно: id в адресе — проверка до стрима, чужой или битый → настоящий 404.
const load = cache(async (raw: string) => {
  const ctx = await requireStaff();
  const id = faqEntryIdSchema.safeParse(raw);
  if (!id.success) return null;
  return getFaqEntry(ctx, id.data);
});

export async function generateMetadata({
  params,
}: PageProps<"/staff/answers/[id]">): Promise<Metadata> {
  const e = await load((await params).id);
  return { title: e ? e.title : "Ответ не найден" };
}

export default async function StaffAnswerPage({
  params,
  searchParams,
}: PageProps<"/staff/answers/[id]">) {
  await requireStaff();
  const e = await load((await params).id);
  if (!e) notFound();
  const now = new Date();
  // ?removed=name,number — что убрало обезличивание при создании черновика (только известные коды)
  const rawRemoved = (await searchParams).removed;
  const removed =
    typeof rawRemoved === "string"
      ? rawRemoved
          .split(",")
          .flatMap((k) => {
            const r = removedKindSchema.safeParse(k);
            return r.success ? [REMOVED[r.data]] : [];
          })
          .slice(0, 8)
      : [];

  return (
    <div className="flex flex-col gap-8 lg:max-w-3xl">
      <PageHeader
        title={e.published ? "Ответ помощника" : "Черновик ответа"}
        back={{ href: "/staff/answers", label: "База ответов" }}
        description={
          e.published && e.publishedAt
            ? `Опубликован ${formatRelativeDay(e.publishedAt, now)} — помощник уже отвечает им студентам.`
            : "Студенты его не видят, пока вы не опубликуете."
        }
      />

      {removed.length ? (
        // Сноска с чертой: что сделал сервер и что проверить человеку
        <p className="flex items-start gap-2.5 border-l-2 border-brand py-1 pl-3 text-base text-ink">
          <Eraser aria-hidden className="mt-0.5 size-5 shrink-0 text-brand" />
          <span>
            Убрали из ответа: {removed.join(", ")}. Проверьте, что личного не осталось, и
            сформулируйте вопрос так, как спросил бы студент.
          </span>
        </p>
      ) : null}

      {e.sourceRequest ? (
        <p className="text-sm text-ink-muted">
          Сделан из ответа на заявку{" "}
          <Link
            href={staffRequestHref(e.sourceRequest.number) as Route}
            className="font-bold text-brand tabular underline-offset-4 hover:underline"
          >
            №&nbsp;{e.sourceRequest.number}
          </Link>{" "}
          — «{e.sourceRequest.type.title}», {e.faculty.code}.
        </p>
      ) : null}

      <FaqEntryForm
        entry={{
          id: e.id,
          title: e.title,
          keywords: e.keywords,
          body: e.body,
          published: e.published,
        }}
      />

      <section aria-labelledby="preview-title" className="flex flex-col gap-3">
        <h2 id="preview-title" className="text-lg">
          Так ответит помощник
        </h2>
        <p className="-mt-1 text-sm text-ink-muted">
          По сохранённому тексту — после правок нажмите «Сохранить».
        </p>
        <div className="flex flex-col gap-2 border-l-2 border-brand py-1 pl-3">
          <Markdown text={`**${e.title}**\n\n${e.body}`} links={false} />
          <p className="text-base text-ink italic">
            {e.published && e.publishedAt
              ? deanAnswerCaption(e.publishedAt, now)
              : "Ответ деканата от ‹дата публикации›"}
          </p>
        </div>
      </section>
    </div>
  );
}
