// Вход для e2e — через настоящую форму /login. Пароли — только из окружения (SEED_PASSWORD_*);
// в сообщениях об ошибке — имя переменной, никогда не значение.
import { expect, type Page } from "@playwright/test";

export const ACCOUNTS = {
  alisa: { login: "student.alisa", env: "SEED_PASSWORD_ALISA" },
  timur: { login: "student.timur", env: "SEED_PASSWORD_TIMUR" },
  vera: { login: "student.new", env: "SEED_PASSWORD_VERA" },
  irina: { login: "staff.irina", env: "SEED_PASSWORD_IRINA" },
} as const;

export type AccountKey = keyof typeof ACCOUNTS;

export function passwordOf(key: AccountKey): string {
  const name = ACCOUNTS[key].env;
  const value = process.env[name];
  if (!value)
    throw new Error(`Нет ${name} в окружении: e2e берут пароли тестовых аккаунтов из .env`);
  return value;
}

/**
 * Заполнить и отправить форму входа и дождаться, пока action завершится целиком.
 * Мало ждать «алерт виден» (он мог остаться от прошлой попытки) и мало ждать ответа сервера:
 * React 19 сбрасывает форму в конце action, и ввод следующей попытки до этого момента стирается.
 * Конец action — кнопка выходит из состояния загрузки (aria-busy).
 */
export async function fillLogin(page: Page, login: string, password: string) {
  const submit = page.getByRole("button", { name: "Войти", exact: true });
  await expect(submit).not.toHaveAttribute("aria-busy", "true");
  await page.getByLabel("Логин").fill(login);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/login",
    ),
    submit.click(),
  ]);
  // Конец: либо ушли с /login (успешный вход), либо кнопка вышла из загрузки (ошибка показана)
  await expect
    .poll(
      async () =>
        !/\/login$/.test(page.url()) ||
        (await submit.getAttribute("aria-busy", { timeout: 1000 }).catch(() => null)) !== "true",
    )
    .toBe(true);
}

/**
 * Свой «IP» для тестов с неудачными входами: блокировка считается по «логин + IP», и без этого
 * прогоны копили бы неудачи на одном адресе. Next не перезаписывает присланный X-Forwarded-For
 * (на проде его заменяет Caddy) — поэтому локально и в CI это работает.
 */
export function randomIpHeaders() {
  const b = () => Math.floor(Math.random() * 254) + 1;
  return { "x-forwarded-for": `10.${b()}.${b()}.${b()}` };
}

/** Вход по паролю и ожидание своего кабинета. */
export async function loginAs(page: Page, key: AccountKey) {
  await page.goto("/login");
  await fillLogin(page, ACCOUNTS[key].login, passwordOf(key));
  await expect(page).toHaveURL(key === "irina" ? /\/staff$/ : /\/$/);
}

export const ANON = { cookies: [], origins: [] };
