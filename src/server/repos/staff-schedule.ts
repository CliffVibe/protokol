import "server-only";
import { db } from "@/server/db";
import { rescheduleNotification } from "@/server/services/staff-rules";
import type { StaffCtx } from "./auth";

// Расписание групп для сотрудника (T09): только академические группы его факультетов (S1: staff.facultyIds).
// Языковые группы смешаны по факультетам — их пары сотрудник факультета не переносит.
// Фильтр по факультету — в КАЖДОМ запросе, включая мутацию.

const ofMyFaculties = (ctx: StaffCtx) => ({ program: { facultyId: { in: ctx.facultyIds } } });

export function groupsForStaff(ctx: StaffCtx) {
  return db.group.findMany({
    where: ofMyFaculties(ctx),
    orderBy: [{ course: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      course: true,
      program: { select: { faculty: { select: { code: true } } } },
    },
  });
}

export type StaffGroup = Awaited<ReturnType<typeof groupsForStaff>>[number];

/** Пары группы за [from, to) — только если группа своего факультета (иначе пусто). */
export function groupLessonsBetween(ctx: StaffCtx, groupId: string, from: Date, to: Date) {
  return db.lesson.findMany({
    where: { groupId, group: ofMyFaculties(ctx), startsAt: { gte: from, lt: to } },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      kind: true,
      startsAt: true,
      endsAt: true,
      building: true,
      room: true,
      change: true,
      changeNote: true,
      originalStartsAt: true,
      discipline: { select: { name: true } },
      teacher: { select: { fullName: true } },
    },
  });
}

/** Начало ближайшей ещё не начавшейся пары группы (не отменённой) — чтобы по умолчанию открыть день, где есть что делать. */
export async function nextLessonStart(ctx: StaffCtx, groupId: string, now: Date) {
  const l = await db.lesson.findFirst({
    where: {
      groupId,
      group: ofMyFaculties(ctx),
      startsAt: { gt: now },
      change: { not: "CANCELLED" },
    },
    orderBy: { startsAt: "asc" },
    select: { startsAt: true },
  });
  return l?.startsAt ?? null;
}

export type StaffLesson = Awaited<ReturnType<typeof groupLessonsBetween>>[number];

export type RescheduleResult =
  { result: "ok"; recipients: number } | { result: "not_found" | "conflict" | "cancelled" };

/**
 * Перенос пары: новое время с той же длительностью, аудитория (если указана), отметка «перенос» и причина;
 * в той же транзакции — уведомление каждому студенту группы.
 * `originalStartsAt` — первое исходное время: повторный перенос не теряет «было 10:10».
 * Два сотрудника разом: updateMany с ожидаемым startsAt и count === 1 → второй получает conflict.
 */
export async function rescheduleLesson(
  ctx: StaffCtx,
  input: {
    lessonId: string;
    expectedStartsAt: Date;
    startsAt: Date;
    room: string | null;
    reason: string;
  },
  now: Date = new Date(),
): Promise<RescheduleResult> {
  return db.$transaction(async (tx) => {
    const l = await tx.lesson.findFirst({
      where: { id: input.lessonId, groupId: { not: null }, group: ofMyFaculties(ctx) },
      select: {
        groupId: true,
        startsAt: true,
        endsAt: true,
        building: true,
        room: true,
        change: true,
        originalStartsAt: true,
        discipline: { select: { name: true } },
      },
    });
    if (!l || !l.groupId) return { result: "not_found" };
    if (l.change === "CANCELLED") return { result: "cancelled" };
    if (+l.startsAt !== +input.expectedStartsAt) return { result: "conflict" };

    const endsAt = new Date(+input.startsAt + (+l.endsAt - +l.startsAt));
    const room = input.room ?? l.room;
    const { count } = await tx.lesson.updateMany({
      where: { id: input.lessonId, startsAt: input.expectedStartsAt, group: ofMyFaculties(ctx) },
      data: {
        startsAt: input.startsAt,
        endsAt,
        room,
        change: "MOVED",
        changeNote: input.reason,
        originalStartsAt: l.originalStartsAt ?? l.startsAt,
      },
    });
    if (count !== 1) return { result: "conflict" };

    const students = await tx.student.findMany({
      where: { groupId: l.groupId },
      select: { id: true },
    });
    const n = rescheduleNotification(
      {
        discipline: l.discipline.name,
        from: l.startsAt,
        to: input.startsAt,
        building: l.building,
        room,
        reason: input.reason,
      },
      now,
    );
    if (students.length)
      await tx.notification.createMany({
        data: students.map((s) => ({ studentId: s.id, ...n, createdAt: now })),
      });
    return { result: "ok", recipients: students.length };
  });
}
