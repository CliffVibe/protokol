// Вход без БД: репозиторий подменён памятью, пароль — настоящий argon2id.
// Проверяем S2 и пункты security-ревью T02: одинаковый ответ, фиктивный хеш, лимиты длины,
// блокировка по «логин + IP», демо-вход только при DEMO_MODE=1.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/server/auth/password";

type Throttle = { failures: number; windowStart: Date; lockedUntil: Date | null };
const store = vi.hoisted(() => ({
  users: new Map<string, { id: string; role: "STUDENT" | "STAFF"; passwordHash: string }>(),
  throttle: new Map<string, Throttle>(),
}));

// Та же логика, что в SQL repos/auth.ts → reserveAttempt (атомарность проверяет интеграционный тест)
vi.mock("@/server/repos/auth", () => ({
  findLoginCandidate: vi.fn(async (login: string) => store.users.get(login) ?? null),
  findUserByLogin: vi.fn(async (login: string) => {
    const u = store.users.get(login);
    return u ? { id: u.id, role: u.role } : null;
  }),
  reserveAttempt: vi.fn(async (key: string, now: Date, windowMs: number) => {
    const t = store.throttle.get(key);
    const lockOver = !!t?.lockedUntil && t.lockedUntil <= now;
    const windowOver = !!t && !t.lockedUntil && t.windowStart.getTime() < now.getTime() - windowMs;
    const next: Throttle =
      !t || lockOver || windowOver
        ? { failures: 1, windowStart: now, lockedUntil: null }
        : { ...t, failures: t.failures + 1 };
    store.throttle.set(key, next);
    return { attempt: next.failures, lockedUntil: next.lockedUntil };
  }),
  lockThrottle: vi.fn(async (key: string, until: Date) => {
    const t = store.throttle.get(key);
    if (t) t.lockedUntil = until;
  }),
  clearThrottle: vi.fn(async (key: string) => void store.throttle.delete(key)),
  pruneThrottles: vi.fn(async () => {}),
}));

const verifySpy = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock("@/server/auth/password", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/server/auth/password")>();
  return {
    ...orig,
    verifyPassword: async (hash: string, password: string) => {
      verifySpy.calls.push(hash);
      return orig.verifyPassword(hash, password);
    },
  };
});

const { authenticate, authenticateDemo, LOCK_MS, MAX_FAILURES, throttleKey } =
  await import("@/server/services/auth");

const PASS = "correct-horse-battery-test";
const IP = "203.0.113.7";
const opts = (now = new Date("2026-11-06T10:00:00Z")) => ({ now, failureDelayMs: 0 });

beforeAll(async () => {
  store.users.set("student.alisa", {
    id: "u-alisa",
    role: "STUDENT",
    passwordHash: await hashPassword(PASS),
  });
  store.users.set("staff.irina", {
    id: "u-irina",
    role: "STAFF",
    passwordHash: await hashPassword("another-test-pass"),
  });
});
beforeEach(() => {
  store.throttle.clear();
  verifySpy.calls.length = 0;
});
afterEach(() => vi.unstubAllEnvs());

describe("authenticate", () => {
  it("верный пароль — вход, логин без учёта регистра и пробелов", async () => {
    const r = await authenticate({ login: "  Student.Alisa ", password: PASS }, IP, opts());
    expect(r).toEqual({ ok: true, userId: "u-alisa", role: "STUDENT" });
  });

  it("неверный пароль и несуществующий логин — один и тот же ответ", async () => {
    const wrong = await authenticate({ login: "student.alisa", password: "nope" }, IP, opts());
    const ghost = await authenticate({ login: "student.ghost", password: "nope" }, IP, opts());
    expect(wrong).toEqual({ ok: false, reason: "invalid" });
    expect(ghost).toEqual(wrong);
  });

  it("нет логина — пароль всё равно проверяется (фиктивным argon2id-хешем)", async () => {
    await authenticate({ login: "student.ghost", password: "nope" }, IP, opts());
    expect(verifySpy.calls).toHaveLength(1);
    expect(verifySpy.calls[0]!.startsWith("$argon2id$")).toBe(true);
  });

  it("пустые поля — ошибки полей, без проверки пароля", async () => {
    const r = await authenticate({ login: " ", password: "" }, IP, opts());
    expect(r).toEqual({
      ok: false,
      reason: "fields",
      fieldErrors: { login: "Введите логин", password: "Введите пароль" },
    });
    expect(verifySpy.calls).toHaveLength(0);
  });

  it("не строки (File, null) — тоже ошибки полей", async () => {
    const r = await authenticate({ login: null, password: 42 }, IP, opts());
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("fields");
  });

  it("пароль длиннее 128 и логин длиннее 64 — общий ответ без argon2 (DoS)", async () => {
    const long = await authenticate(
      { login: "student.alisa", password: "x".repeat(129) },
      IP,
      opts(),
    );
    const longLogin = await authenticate({ login: "a".repeat(65), password: PASS }, IP, opts());
    expect(long).toEqual({ ok: false, reason: "invalid" });
    expect(longLogin).toEqual({ ok: false, reason: "invalid" });
    expect(verifySpy.calls).toHaveLength(0);
  });

  it("пароль ровно 128 символов ещё проверяется", async () => {
    await authenticate({ login: "student.alisa", password: "x".repeat(128) }, IP, opts());
    expect(verifySpy.calls).toHaveLength(1);
  });
});

describe("блокировка по «логин + IP»", () => {
  const fail = (now: Date, ip = IP, login = "student.alisa") =>
    authenticate({ login, password: "wrong" }, ip, opts(now));

  it(`${MAX_FAILURES} неудач → блок; 6-я попытка даже с верным паролем отклонена без проверки`, async () => {
    const t0 = new Date("2026-11-06T10:00:00Z");
    for (let i = 1; i < MAX_FAILURES; i++) expect((await fail(t0)).ok).toBe(false);
    expect(await fail(t0)).toEqual({ ok: false, reason: "locked" });

    verifySpy.calls.length = 0;
    const sixth = await authenticate({ login: "student.alisa", password: PASS }, IP, opts(t0));
    expect(sixth).toEqual({ ok: false, reason: "locked" });
    expect(verifySpy.calls).toHaveLength(0);
  });

  it("через 5 минут блок снимается, верный пароль пускает и сбрасывает счётчик", async () => {
    const t0 = new Date("2026-11-06T10:00:00Z");
    for (let i = 0; i < MAX_FAILURES; i++) await fail(t0);
    const later = new Date(t0.getTime() + LOCK_MS + 1);
    const r = await authenticate({ login: "student.alisa", password: PASS }, IP, opts(later));
    expect(r.ok).toBe(true);
    expect(store.throttle.has(throttleKey("student.alisa", IP))).toBe(false);
  });

  it("посторонний с другого IP не блокирует вход жюри", async () => {
    const t0 = new Date("2026-11-06T10:00:00Z");
    for (let i = 0; i < MAX_FAILURES + 3; i++) await fail(t0, "198.51.100.66");
    const jury = await authenticate({ login: "student.alisa", password: PASS }, IP, opts(t0));
    expect(jury.ok).toBe(true);
  });

  it("блокировка одного логина не мешает другому логину с того же IP", async () => {
    const t0 = new Date("2026-11-06T10:00:00Z");
    for (let i = 0; i < MAX_FAILURES; i++) await fail(t0);
    const irina = await authenticate(
      { login: "staff.irina", password: "another-test-pass" },
      IP,
      opts(t0),
    );
    expect(irina.ok).toBe(true);
  });

  it("несуществующий логин блокируется так же — по блокировке не понять, есть ли логин", async () => {
    const t0 = new Date("2026-11-06T10:00:00Z");
    for (let i = 1; i < MAX_FAILURES; i++) await fail(t0, IP, "student.ghost");
    expect(await fail(t0, IP, "student.ghost")).toEqual({ ok: false, reason: "locked" });
  });

  it("неудачи, разнесённые больше чем на 15 минут, не копятся", async () => {
    const t0 = new Date("2026-11-06T10:00:00Z");
    for (let i = 0; i < MAX_FAILURES - 1; i++) await fail(t0);
    const r = await fail(new Date(t0.getTime() + 16 * 60 * 1000));
    expect(r).toEqual({ ok: false, reason: "invalid" });
  });

  it("в ключе нет логина и IP в открытом виде", () => {
    const key = throttleKey("student.alisa", IP);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain("alisa");
  });
});

describe("демо-вход", () => {
  it("без DEMO_MODE=1 — отказ даже для демо-логина", async () => {
    vi.stubEnv("DEMO_MODE", "");
    expect(await authenticateDemo({ login: "student.alisa" })).toEqual({ ok: false });
    vi.stubEnv("DEMO_MODE", "true");
    expect(await authenticateDemo({ login: "student.alisa" })).toEqual({ ok: false });
  });

  it("при DEMO_MODE=1 — только логины из фиксированного списка", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    expect(await authenticateDemo({ login: "student.alisa" })).toEqual({
      ok: true,
      userId: "u-alisa",
      role: "STUDENT",
    });
    store.users.set("student.bg1", { id: "u-bg", role: "STUDENT", passwordHash: "x" });
    expect(await authenticateDemo({ login: "student.bg1" })).toEqual({ ok: false });
    expect(await authenticateDemo({ login: null })).toEqual({ ok: false });
  });
});
