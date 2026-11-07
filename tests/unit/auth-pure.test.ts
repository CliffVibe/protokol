// Чистые части входа: токен сессии, флаги cookie, IP клиента, CSP, демо-аккаунты.
import { describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS, DEMO_LOGINS, DEMO_SCENARIOS } from "@/lib/demo-accounts";
import { clientIpFrom } from "@/lib/client-ip";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  SESSION_TTL_MS,
  generateSessionToken,
  hashSessionToken,
  isWellFormedToken,
} from "@/server/auth/tokens";
import { buildCsp } from "@/proxy";
import { DEMO } from "../../prisma/seed-data";

describe("токен сессии (S3)", () => {
  it("32 случайных байта в base64url, каждый раз новый", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
    expect(a).not.toBe(b);
    expect(isWellFormedToken(a)).toBe(true);
  });

  it("в БД — sha256 токена, не сам токен", () => {
    const t = generateSessionToken();
    const h = hashSessionToken(t);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(t);
  });

  it("мусор вместо токена отбрасывается до запроса к БД", () => {
    for (const bad of [
      undefined,
      null,
      "",
      "abc",
      "x".repeat(44),
      "a".repeat(42) + "=",
      "'; drop",
    ]) {
      expect(isWellFormedToken(bad)).toBe(false);
    }
  });

  it("cookie: __Host-, HttpOnly, Secure, SameSite=Lax, Path=/, 7 дней", () => {
    expect(SESSION_COOKIE).toBe("__Host-session");
    expect(SESSION_COOKIE_OPTIONS).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
    expect(SESSION_TTL_MS).toBe(7 * 24 * 3600 * 1000);
  });
});

describe("IP клиента", () => {
  it("последний адрес из X-Forwarded-For — его добавил ближайший прокси (Caddy)", () => {
    expect(clientIpFrom("1.1.1.1, 203.0.113.7")).toBe("203.0.113.7");
    expect(clientIpFrom("203.0.113.7")).toBe("203.0.113.7");
  });
  it("без заголовка — 'unknown'; мусор обрезается", () => {
    expect(clientIpFrom(null)).toBe("unknown");
    expect(clientIpFrom(" , ")).toBe("unknown");
    expect(clientIpFrom("x".repeat(500))).toHaveLength(64);
  });
});

describe("CSP (S6)", () => {
  const prod = buildCsp("abc", { dev: false, https: true });
  it("прод: nonce для скриптов и стилей, без unsafe-*", () => {
    expect(prod).toContain("default-src 'self'");
    expect(prod).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(prod).toContain("style-src 'self' 'nonce-abc'");
    expect(prod).toContain("frame-ancestors 'none'");
    expect(prod).toContain("object-src 'none'");
    expect(prod).toContain("upgrade-insecure-requests");
    expect(prod).not.toContain("unsafe");
  });
  it("service worker и манифест (T11): свои директивы — 'strict-dynamic' отключает 'self' в script-src", () => {
    expect(prod).toContain("worker-src 'self'");
    expect(prod).toContain("manifest-src 'self'");
  });
  it("dev: eval и inline-стили только для разработки", () => {
    const dev = buildCsp("abc", { dev: true, https: false });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });
});

describe("демо-аккаунты", () => {
  it("совпадают с логинами сида", () => {
    expect([...DEMO_LOGINS].sort()).toEqual(
      Object.values(DEMO)
        .map((d) => d.login)
        .sort(),
    );
    expect(DEMO_ACCOUNTS.map((a) => a.login)).toEqual([...DEMO_LOGINS]);
  });
  it("ровно 6 сценариев — как в 01-concept", () => {
    expect(DEMO_SCENARIOS).toHaveLength(6);
  });
});
