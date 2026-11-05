// Один раз входим как Алиса и Ирина через настоящую форму и сохраняем сессии для остальных тестов.
// Файлы tests/e2e/.auth/*.json содержат токены — они в .gitignore.
import { test as setup } from "@playwright/test";
import { STORAGE } from "../../playwright.config";
import { loginAs } from "./helpers/auth";

setup.use({ storageState: { cookies: [], origins: [] } });

setup("вход: Алиса", async ({ page }) => {
  await loginAs(page, "alisa");
  await page.context().storageState({ path: STORAGE.alisa });
});

setup("вход: Ирина", async ({ page }) => {
  await loginAs(page, "irina");
  await page.context().storageState({ path: STORAGE.irina });
});
