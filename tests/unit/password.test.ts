import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/server/auth/password";

describe("argon2id (S2)", () => {
  it("хеш — argon2id с параметрами не ниже m=19456, t=2, p=1", async () => {
    const h = await hashPassword("пароль-для-теста");
    expect(h.startsWith("$argon2id$")).toBe(true);
    const params = /\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(h);
    expect(params).not.toBeNull();
    const [, m, t, p] = params!.map(Number);
    expect(m).toBeGreaterThanOrEqual(19456);
    expect(t).toBeGreaterThanOrEqual(2);
    expect(p).toBeGreaterThanOrEqual(1);
  });

  it("каждый хеш со своей солью", async () => {
    const [a, b] = await Promise.all([hashPassword("один"), hashPassword("один")]);
    expect(a).not.toBe(b);
  });

  it("верный пароль проходит, неверный — нет", async () => {
    const h = await hashPassword("верный");
    expect(await verifyPassword(h, "верный")).toBe(true);
    expect(await verifyPassword(h, "неверный")).toBe(false);
  });

  it("битый хеш не роняет вход, а даёт false", async () => {
    expect(await verifyPassword("не-хеш", "что-угодно")).toBe(false);
  });

  it("пустой пароль не хешируется", async () => {
    await expect(hashPassword("")).rejects.toThrow();
  });
});
