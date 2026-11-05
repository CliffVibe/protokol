// Сессии и блокировка входа на настоящем PostgreSQL (S2, S3).
// Только при TEST_DATABASE_URL. Свои пользователи с уникальными логинами — сид не трогаем,
// после теста всё удаляется (каскадом вместе с сессиями).
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { hashPassword } from "@/server/auth/password";
import { SESSION_TTL_MS, hashSessionToken } from "@/server/auth/tokens";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("вход и сессии в PostgreSQL", async () => {
  // Репозитории берут строку подключения из DATABASE_URL при первом импорте db.ts
  process.env.DATABASE_URL = url;
  const sessions = await import("@/server/services/sessions");
  const auth = await import("@/server/services/auth");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const suffix = randomBytes(4).toString("hex");
  const login = `it.auth.${suffix}`;
  const password = `it-${randomBytes(9).toString("base64url")}`;
  let userId = "";
  const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
  const t0 = new Date();
  const keysToClean: string[] = [];

  beforeAll(async () => {
    const u = await prisma.user.create({
      data: { login, role: "STUDENT", passwordHash: await hashPassword(password) },
      select: { id: true },
    });
    userId = u.id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { login } });
    await prisma.loginThrottle.deleteMany({
      where: {
        key: {
          in: [auth.throttleKey(login, ip), auth.throttleKey(login, "other-ip"), ...keysToClean],
        },
      },
    });
    await prisma.$disconnect();
  });

  it("в таблице — sha256 токена, сам токен не хранится", async () => {
    const { token } = await sessions.startSession(userId, t0);
    const rows = await prisma.session.findMany({ where: { userId }, select: { id: true } });
    expect(rows.map((r) => r.id)).toContain(hashSessionToken(token));
    expect(rows.map((r) => r.id)).not.toContain(token);
    expect(await sessions.resolveSession(token, t0)).toEqual({ userId, role: "STUDENT" });
  });

  it("истёкшая сессия не действует и удаляется", async () => {
    const { token } = await sessions.startSession(userId, t0);
    const after = new Date(t0.getTime() + SESSION_TTL_MS + 1000);
    expect(await sessions.resolveSession(token, after)).toBeNull();
    const left = await prisma.session.count({ where: { id: hashSessionToken(token) } });
    expect(left).toBe(0);
  });

  it("продление при активности: через 2 дня срок снова 7 дней", async () => {
    const { token } = await sessions.startSession(userId, t0);
    const twoDays = new Date(t0.getTime() + 2 * 24 * 3600 * 1000);
    await sessions.resolveSession(token, twoDays);
    const s = await prisma.session.findUniqueOrThrow({
      where: { id: hashSessionToken(token) },
      select: { expiresAt: true },
    });
    expect(s.expiresAt.getTime()).toBe(twoDays.getTime() + SESSION_TTL_MS);
  });

  it("выход удаляет запись: старый токен больше не пускает", async () => {
    const { token } = await sessions.startSession(userId, t0);
    await sessions.endSession(token);
    expect(await sessions.resolveSession(token, t0)).toBeNull();
  });

  it("«выйти на всех устройствах» удаляет все сессии пользователя", async () => {
    const a = await sessions.startSession(userId, t0);
    const b = await sessions.startSession(userId, t0);
    await sessions.endAllSessions(userId);
    expect(await sessions.resolveSession(a.token, t0)).toBeNull();
    expect(await sessions.resolveSession(b.token, t0)).toBeNull();
    expect(await prisma.session.count({ where: { userId } })).toBe(0);
  });

  it("блокировка: 5 неудач → верный пароль отклонён → через 5 минут пускает; другой IP не задет", async () => {
    const o = (now: Date) => ({ now, failureDelayMs: 0 });
    for (let i = 0; i < auth.MAX_FAILURES; i++) {
      await auth.authenticate({ login, password: "wrong" }, ip, o(t0));
    }
    expect(await auth.authenticate({ login, password }, ip, o(t0))).toEqual({
      ok: false,
      reason: "locked",
    });
    expect((await auth.authenticate({ login, password }, "other-ip", o(t0))).ok).toBe(true);

    const later = new Date(t0.getTime() + auth.LOCK_MS + 1000);
    expect((await auth.authenticate({ login, password }, ip, o(later))).ok).toBe(true);
    expect(await prisma.loginThrottle.count({ where: { key: auth.throttleKey(login, ip) } })).toBe(
      0,
    );
  });

  it("20 параллельных неверных попыток — пароль проверяют не больше пяти (гонка, security-reviewer T03)", async () => {
    const raceIp = `race-${suffix}`;
    keysToClean.push(auth.throttleKey(login, raceIp));
    const o = { now: t0, failureDelayMs: 0 };
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        auth.authenticate({ login, password: `wrong-${i}` }, raceIp, o),
      ),
    );
    const reasons = results.map((r) => (r.ok ? "ok" : r.reason));
    // Попытки 1–4 — «неверно», 5-я блокирует, 6–20 отклонены без проверки пароля
    expect(reasons.filter((r) => r === "invalid")).toHaveLength(auth.MAX_FAILURES - 1);
    expect(reasons.filter((r) => r === "locked")).toHaveLength(20 - (auth.MAX_FAILURES - 1));
    // И верный пароль сразу после — тоже отказ
    expect(await auth.authenticate({ login, password }, raceIp, o)).toEqual({
      ok: false,
      reason: "locked",
    });
  });

  it("окно 15 минут считает SQL: неудачи с разницей больше окна не копятся", async () => {
    const winIp = `window-${suffix}`;
    keysToClean.push(auth.throttleKey(login, winIp));
    const o = (now: Date) => ({ now, failureDelayMs: 0 });
    for (let i = 0; i < auth.MAX_FAILURES - 1; i++) {
      await auth.authenticate({ login, password: "wrong" }, winIp, o(t0));
    }
    const later = new Date(t0.getTime() + auth.FAILURE_WINDOW_MS + 60_000);
    expect(await auth.authenticate({ login, password: "wrong" }, winIp, o(later))).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("старые счётчики подчищаются при неудачах", async () => {
    const staleKey = `stale-${suffix}`;
    const old = new Date(t0.getTime() - 2 * 3600 * 1000);
    await prisma.loginThrottle.create({
      data: { key: staleKey, failures: 3, windowStart: old, updatedAt: old },
    });
    const pruneIp = `prune-${suffix}`;
    keysToClean.push(auth.throttleKey(login, pruneIp));
    await auth.authenticate({ login, password: "wrong" }, pruneIp, { now: t0, failureDelayMs: 0 });
    expect(await prisma.loginThrottle.count({ where: { key: staleKey } })).toBe(0);
  });
});
