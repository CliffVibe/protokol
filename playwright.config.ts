import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

// dotenv: пароли SEED_PASSWORD_* и DATABASE_URL — в процесс тестов и сервера из .env (в CI — из env workflow).
// Значения в отчёты не печатаются: тесты называют только имя переменной.
export const STORAGE = {
  alisa: "tests/e2e/.auth/alisa.json",
  irina: "tests/e2e/.auth/irina.json",
} as const;

const PORT = Number(process.env.E2E_PORT ?? 3000);
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
        command: "pnpm build && pnpm start",
        // DEMO_MODE=1 — e2e проверяют и кнопки «Войти как…»
        env: { PORT: String(PORT), DEMO_MODE: "1" },
        url: `${baseURL}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
      },
});
