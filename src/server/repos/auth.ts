import "server-only";
import type { Role } from "@/generated/prisma/client";
import { db } from "@/server/db";

// Вход и сессии — второе исключение из правила «каждая функция репозитория принимает ctx»
// (первое — system.ts): здесь ctx ещё нет, его отсюда и получают. Правила (CLAUDE.md, S1):
//  - только явный select, никаких include целых User/Student;
//  - passwordHash возвращает только findLoginCandidate и только для services/auth.ts;
//  - контекст студента/сотрудника строится по userId из сессии, а не из URL или формы.

// ── Вход ────────────────────────────────────────────────────────────────

export type LoginCandidate = { id: string; role: Role; passwordHash: string };

/** Только для services/auth.ts → authenticate(): хеш не должен уходить дальше проверки пароля. */
export function findLoginCandidate(login: string): Promise<LoginCandidate | null> {
  return db.user.findUnique({
    where: { login },
    select: { id: true, role: true, passwordHash: true },
  });
}

/** Демо-вход «Войти как…»: без хеша пароля. */
export function findUserByLogin(login: string): Promise<{ id: string; role: Role } | null> {
  return db.user.findUnique({ where: { login }, select: { id: true, role: true } });
}

// ── Сессии (id = sha256 токена) ───────────────────────────────────────────

export async function insertSession(id: string, userId: string, expiresAt: Date): Promise<void> {
  await db.session.create({ data: { id, userId, expiresAt }, select: { id: true } });
}

export type SessionRecord = { expiresAt: Date; user: { id: string; role: Role } };

export function findSession(id: string): Promise<SessionRecord | null> {
  return db.session.findUnique({
    where: { id },
    select: { expiresAt: true, user: { select: { id: true, role: true } } },
  });
}

export async function extendSession(id: string, expiresAt: Date): Promise<void> {
  await db.session.updateMany({ where: { id }, data: { expiresAt } });
}

export async function deleteSession(id: string): Promise<void> {
  await db.session.deleteMany({ where: { id } });
}

export async function deleteUserSessions(userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } });
}

export async function deleteExpiredSessions(userId: string, now: Date): Promise<void> {
  await db.session.deleteMany({ where: { userId, expiresAt: { lte: now } } });
}

// ── Блокировка по «логин + IP» (key = sha256, см. services/auth.ts) ─────────

export type ThrottleState = { failures: number; windowStart: Date; lockedUntil: Date | null };

export function findThrottle(key: string): Promise<ThrottleState | null> {
  return db.loginThrottle.findUnique({
    where: { key },
    select: { failures: true, windowStart: true, lockedUntil: true },
  });
}

export async function saveThrottle(key: string, state: ThrottleState): Promise<void> {
  await db.loginThrottle.upsert({
    where: { key },
    create: { key, ...state },
    update: state,
    select: { key: true },
  });
}

export async function clearThrottle(key: string): Promise<void> {
  await db.loginThrottle.deleteMany({ where: { key } });
}

// ── Контекст для guards (userId — только из сессии) ────────────────────────

export type StudentCtx = {
  userId: string;
  studentId: string;
  groupIds: string[];
  languageGroupIds: string[];
};

export async function loadStudentCtx(userId: string): Promise<StudentCtx | null> {
  const s = await db.student.findUnique({
    where: { userId },
    select: { id: true, groupId: true, languageGroups: { select: { languageGroupId: true } } },
  });
  if (!s) return null;
  return {
    userId,
    studentId: s.id,
    groupIds: [s.groupId],
    languageGroupIds: s.languageGroups.map((l) => l.languageGroupId),
  };
}

export type StaffCtx = { userId: string; staffId: string; facultyIds: string[] };

export async function loadStaffCtx(userId: string): Promise<StaffCtx | null> {
  const s = await db.staff.findUnique({
    where: { userId },
    select: { id: true, facultyIds: true },
  });
  if (!s) return null;
  return { userId, staffId: s.id, facultyIds: s.facultyIds };
}
