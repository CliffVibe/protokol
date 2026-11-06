import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { audienceSchema, type Audience } from "@/lib/audience";
import { db } from "@/server/db";
import { announcementNotification } from "@/server/services/staff-rules";
import type { StaffCtx } from "./auth";

// Объявления сотрудника (T09). Адресаты — только студенты его факультетов (S1: staff.facultyIds):
// фильтр по facultyId в запросе адресатов стоит ВСЕГДА, поверх audience — даже если audience
// когда-нибудь окажется шире (битая форма, ошибка в buildAudience), уведомление чужим не уйдёт.

/** Факультеты и группы сотрудника — для формы «Кому». */
export async function staffAudienceOptions(ctx: StaffCtx) {
  const [faculties, groups] = await Promise.all([
    db.faculty.findMany({
      where: { id: { in: ctx.facultyIds } },
      orderBy: { code: "asc" },
      select: { code: true, name: true },
    }),
    db.group.findMany({
      where: { program: { facultyId: { in: ctx.facultyIds } } },
      orderBy: [{ course: "asc" }, { name: "asc" }],
      select: {
        name: true,
        course: true,
        program: { select: { faculty: { select: { code: true } } } },
      },
    }),
  ]);
  return {
    faculties,
    groups: groups.map((g) => ({
      name: g.name,
      course: g.course,
      facultyCode: g.program.faculty.code,
    })),
  };
}

export type StaffAudienceOptions = Awaited<ReturnType<typeof staffAudienceOptions>>;

/** Условие «студент — адресат»: тот же смысл, что matchesAudience (lib/audience.ts), но запросом. */
function recipientsWhere(ctx: StaffCtx, a: Audience): Prisma.StudentWhereInput {
  return {
    group: {
      program: {
        facultyId: { in: ctx.facultyIds },
        ...(a.facultyCodes ? { faculty: { code: { in: a.facultyCodes } } } : {}),
      },
      ...(a.courses ? { course: { in: a.courses } } : {}),
      ...(a.groupNames ? { name: { in: a.groupNames } } : {}),
    },
  };
}

export function countRecipients(ctx: StaffCtx, audience: Audience): Promise<number> {
  return db.student.count({ where: recipientsWhere(ctx, audience) });
}

export type PublishResult =
  { ok: true; id: string; recipients: number } | { ok: false; reason: "empty" };

/** Публикация: объявление и уведомления адресатам — одной транзакцией (нет «объявления без уведомлений»). */
export async function publishAnnouncement(
  ctx: StaffCtx,
  input: { title: string; body: string; audience: Audience; pinned: boolean },
  now: Date = new Date(),
): Promise<PublishResult> {
  const audience = audienceSchema.parse(input.audience);
  return db.$transaction(async (tx) => {
    const students = await tx.student.findMany({
      where: recipientsWhere(ctx, audience),
      select: { id: true },
    });
    if (!students.length) return { ok: false, reason: "empty" } as const;
    const a = await tx.announcement.create({
      data: {
        title: input.title,
        body: input.body,
        audience,
        authorId: ctx.staffId,
        publishedAt: now,
        pinned: input.pinned,
      },
      select: { id: true },
    });
    const n = announcementNotification({ id: a.id, title: input.title, body: input.body });
    await tx.notification.createMany({
      data: students.map((s) => ({ studentId: s.id, ...n, createdAt: now })),
    });
    return { ok: true, id: a.id, recipients: students.length } as const;
  });
}

/**
 * Свои объявления — новые сверху, с числом адресатов на факультетах сотрудника (по audience, а не по
 * разосланным уведомлениям: объявления сида рассылались не всем — «получили 0» было бы неправдой, ux-reviewer T09).
 */
export async function myAnnouncements(ctx: StaffCtx) {
  const rows = await db.announcement.findMany({
    where: { authorId: ctx.staffId },
    orderBy: { publishedAt: "desc" },
    take: 50,
    select: { id: true, title: true, body: true, audience: true, publishedAt: true, pinned: true },
  });
  return Promise.all(
    rows.map(async (r) => {
      const parsed = audienceSchema.safeParse(r.audience);
      return {
        id: r.id,
        title: r.title,
        body: r.body,
        publishedAt: r.publishedAt,
        pinned: r.pinned,
        audience: parsed.success ? parsed.data : null,
        audienceSize: parsed.success ? await countRecipients(ctx, parsed.data) : 0,
      };
    }),
  );
}

export type MyAnnouncement = Awaited<ReturnType<typeof myAnnouncements>>[number];

/** Закрепить/открепить — только своё объявление (count 1), иначе false (→ 404). */
export async function setPinned(ctx: StaffCtx, id: string, pinned: boolean): Promise<boolean> {
  const { count } = await db.announcement.updateMany({
    where: { id, authorId: ctx.staffId },
    data: { pinned },
  });
  return count === 1;
}
