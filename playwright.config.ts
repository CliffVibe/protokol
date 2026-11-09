import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

import { e2eDatabaseUrl } from "./tests/e2e/e2e-db";

// dotenv: пароли SEED_PASSWORD_* и DATABASE_URL — в процесс тестов и сервера из .env (в CI — из env workflow).
// Значения в отчёты не печатаются: тесты называют только имя переменной.
export const STORAGE = {
  alisa: "tests/e2e/.auth/alisa.json",
  irina: "tests/e2e/.auth/irina.json",
} as const;

// Своя база protokol_e2e (T13): сервер e2e и хелперы тестов (helpers/db.ts) смотрят в неё, а не в демо.
// Конфиг читают и главный процесс, и воркеры — подмена одинаковая и повторная безвредна.
// Против внешнего адреса (E2E_BASE_URL) база локально не нужна.
if (!process.env.E2E_BASE_URL) process.env.DATABASE_URL = e2eDatabaseUrl();

// 3100, а не 3000: reuseExistingServer не должен подхватить dev-сервер человека на 3000 с демо-базой
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    trace: "retain-on-failure",
    // Service worker (T11) — только в pwa.spec.ts: иначе каждый тест расписания докачивал бы две недели
    // страниц, а ответы шли бы мимо page.route
    serviceWorkers: "block",
  },
  projects: [
    // Вход через настоящую форму один раз; сессии Алисы и Ирины переиспользуют остальные тесты
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "desktop",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        storageState: STORAGE.alisa,
      },
    },
    {
      name: "mobile-360",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 740 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        storageState: STORAGE.alisa,
      },
    },
  ],
  // Против прод-сборки: так e2e ловят то же, что увидит жюри. E2E_BASE_URL — для smoke по проду.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // Сначала база e2e (создать → миграции → свежий сид): webServer стартует раньше globalSetup,
        // а /api/health без базы отвечает 503. Сид от сегодняшней даты — тесты не зависят от даты пересева демо
        command: "pnpm exec tsx tests/e2e/prepare-db.ts && pnpm build && pnpm start",
        // DEMO_MODE=1 — e2e проверяют и кнопки «Войти как…»; ASSISTANT_PROVIDER=faq — помощник без GigaChat:
        // ответы детерминированы, токены не тратятся, ключ из .env в e2e не участвует (T12)
        env: {
          PORT: String(PORT),
          DATABASE_URL: process.env.DATABASE_URL ?? "",
          DEMO_MODE: "1",
          ASSISTANT_PROVIDER: "faq",
        },
        url: `${baseURL}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
      },
});
