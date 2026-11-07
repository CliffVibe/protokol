import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SessionActions } from "@/components/logout-button";
import { PageHeader } from "@/components/page-header";
import { CalendarSubscription } from "@/components/profile/calendar-subscription";
import { calendarFeedUrls } from "@/lib/calendar-token";
import { requireStudent } from "@/server/auth/guards";
import { appUrl } from "@/server/app-url";
import { profileOf } from "@/server/repos/profile";

export const metadata: Metadata = { title: "Профиль" };

// Профиль (T11): кто я, подписка на расписание (.ics, S7) и выход со всех устройств.
// Данные — только свои: repos/profile.profileOf(ctx) по ctx.studentId (S1), без номера зачётки.
// Доступ — requireStudent() первой строкой, до любых данных (CLAUDE.md → «Железные правила»).
export default async function ProfilePage() {
  const ctx = await requireStudent();
  const p = await profileOf(ctx);
  if (!p) notFound();

  const fullName = [p.lastName, p.firstName, p.middleName].filter(Boolean).join(" ");
  const origin = appUrl();
  const rows: { term: string; value: string }[] = [
    { term: "Факультет", value: p.group.program.faculty.name },
    { term: "Направление", value: p.group.program.name },
    { term: "Курс и группа", value: `${p.group.course}-й курс, группа ${p.group.name}` },
  ];
  if (p.languageGroups.length) {
    rows.push({
      term: p.languageGroups.length > 1 ? "Языковые группы" : "Языковая группа",
      value: p.languageGroups
        .map(({ languageGroup: l }) => `${l.language} ${l.level} (${l.name})`)
        .join(", "),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Профиль" description={fullName} />

      <section aria-labelledby="me-title" className="flex flex-col gap-3">
        <h2 id="me-title" className="sr-only">
          Мои данные
        </h2>
        <dl className="flex max-w-[40rem] flex-col divide-y divide-line border-y border-line">
          {rows.map((r) => (
            <div key={r.term} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:gap-4">
              <dt className="text-sm text-ink-muted sm:w-40 sm:shrink-0 sm:pt-0.5">{r.term}</dt>
              <dd className="text-base break-words text-ink">{r.value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-ink-muted">
          Нашли ошибку в данных — напишите в деканат своего факультета.
        </p>
      </section>

      <CalendarSubscription
        urls={calendarFeedUrls(origin, p.calendarToken)}
        published={origin.startsWith("https://")}
      />

      <SessionActions className="max-w-xl" />
    </div>
  );
}
