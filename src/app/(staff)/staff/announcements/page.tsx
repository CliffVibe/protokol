import type { Metadata } from "next";
import { Pin, PinOff, Users } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/page-header";
import { AnnouncementForm } from "@/components/staff/announcement-form";
import { Button } from "@/components/ui/button";
import { formatRelativeDay, formatTime, plural } from "@/lib/dates";
import { requireStaff } from "@/server/auth/guards";
import { togglePinAction } from "@/server/actions/announcements";
import { myAnnouncements, staffAudienceOptions } from "@/server/repos/staff-announcements";
import { describeAudience } from "@/server/services/staff-rules";

export const metadata: Metadata = { title: "Объявления" };

// Объявления сотрудника (T09): новое объявление для своих факультетов/курсов/групп — публикация создаёт
// уведомления адресатам; ниже — свои объявления с «Закрепить / Открепить».
// Доступ — requireStaff() первой строкой, до любых данных (CLAUDE.md → «Железные правила»).
export default async function StaffAnnouncementsPage() {
  const ctx = await requireStaff();
  const [options, mine] = await Promise.all([staffAudienceOptions(ctx), myAnnouncements(ctx)]);
  const now = new Date();

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Объявления"
        description="Объявление увидят студенты ваших факультетов на доске объявлений, в уведомлениях и на главной."
      />

      <section aria-labelledby="new-announcement" className="flex flex-col gap-4">
        <h2 id="new-announcement" className="text-lg">
          Новое объявление
        </h2>
        <AnnouncementForm options={options} />
      </section>

      <section aria-labelledby="my-announcements" className="flex flex-col gap-4 lg:max-w-3xl">
        <h2 id="my-announcements" className="text-lg">
          Мои объявления
        </h2>
        {mine.length ? (
          <ul className="flex flex-col divide-y divide-line border-y border-line">
            {mine.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 py-4">
                <p className="flex flex-wrap items-center gap-x-3 text-sm text-ink-muted">
                  {a.pinned ? (
                    <span className="inline-flex items-center gap-1 font-bold text-brand">
                      <Pin aria-hidden className="size-4" />
                      Закреплено
                    </span>
                  ) : null}
                  <span className="tabular">
                    {formatRelativeDay(a.publishedAt, now)}, {formatTime(a.publishedAt)}
                  </span>
                </p>
                <h3 className="font-heading text-lg font-semibold break-words">{a.title}</h3>
                <p className="flex items-start gap-1.5 text-sm text-ink-muted">
                  <Users aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Кому: {a.audience ? describeAudience(a.audience) : "адресаты не распознаны"}. На
                    ваших факультетах — {a.audienceSize}{" "}
                    {plural(a.audienceSize, ["студент", "студента", "студентов"])}
                  </span>
                </p>
                <Markdown text={a.body} className="text-sm" />
                <form action={togglePinAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="pinned" value={a.pinned ? "false" : "true"} />
                  <Button
                    type="submit"
                    variant="outline"
                    aria-label={`${a.pinned ? "Открепить" : "Закрепить"}: ${a.title}`}
                  >
                    {a.pinned ? (
                      <PinOff aria-hidden data-icon="inline-start" />
                    ) : (
                      <Pin aria-hidden data-icon="inline-start" />
                    )}
                    {a.pinned ? "Открепить" : "Закрепить"}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="Вы ещё не публиковали объявлений"
            description="Первое объявление — в форме выше. Студенты получат уведомление сразу."
          />
        )}
      </section>
    </div>
  );
}
