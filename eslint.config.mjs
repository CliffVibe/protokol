import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      // S1 (docs/05-security.md): Prisma — только через репозитории с ctx.
      // Версия правила из typescript-eslint: разрешает `import type` (типы и enum-типы можно везде).
      "no-restricted-imports": "off",
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/server/db",
              message:
                "Импорт @/server/db разрешён только в src/server/repos/**. Добавь функцию в репозиторий с ctx.",
            },
          ],
          patterns: [
            {
              // **/db — ещё и `../db` из src/server/services и т. п. (иначе обход репозиториев)
              group: ["**/server/db", "**/db", "./db"],
              message:
                "Prisma — только в src/server/repos/** и src/server/db.ts. Добавь функцию в репозиторий с ctx.",
            },
            {
              group: [
                "@prisma/client",
                "@prisma/client/*",
                "@prisma/adapter-pg",
                "pg",
                "@/generated/prisma",
                "@/generated/prisma/*",
                "**/generated/prisma/**",
              ],
              allowTypeImports: true,
              message:
                "Клиент Prisma и драйвер БД — только в src/server/repos/** и src/server/db.ts. Здесь можно `import type`.",
            },
          ],
        },
      ],
      // То же для динамического `await import(...)` — no-restricted-imports его не видит (security-reviewer, T02)
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ImportExpression[source.value=/server\\/db|(^|\\/)db$|generated\\/prisma|^@prisma\\/|^pg$/]",
          message: "Prisma и драйвер БД — только в src/server/repos/** (динамический import тоже).",
        },
      ],
    },
  },
  {
    // repos/auth.ts принимает голые login/userId (ctx ещё нет): звать его можно только из входа и guards,
    // иначе в T05+ легко написать loadStudentCtx(params.id) (security-reviewer, T03)
    files: ["src/**"],
    ignores: [
      "src/server/auth/**",
      "src/server/services/auth.ts",
      "src/server/services/sessions.ts",
      "src/server/repos/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/repos/auth", "**/repos/auth.ts"],
              message:
                "repos/auth — только для src/server/auth и services/{auth,sessions}. Контекст пользователя — из requireStudent()/requireStaff().",
            },
          ],
          paths: [
            {
              name: "@/server/repos/auth",
              message:
                "repos/auth — только для src/server/auth и services/{auth,sessions}. Контекст пользователя — из requireStudent()/requireStaff().",
            },
          ],
        },
      ],
    },
  },
  {
    // Где работа с БД разрешена: репозитории, клиент, сид/миграции и интеграционные тесты,
    // а также security.spec.ts — тест 6 из 05-security проверяет хеши паролей прямо в БД
    // и requests.spec.ts + helpers/db.ts — двойная отправка считается в БД, тестовые заявки убираются (T08);
    files: [
      "src/server/repos/**",
      "src/server/db.ts",
      "prisma/**",
      "tests/integration/**",
      "tests/e2e/security.spec.ts",
      "tests/e2e/requests.spec.ts",
      "tests/e2e/helpers/db.ts",
      // T09: временный студент со своей сессией (счётчики непрочитанных не делят с демо и параллельными
      // проектами), уборка объявлений и возврат перенесённой пары
      "tests/e2e/helpers/temp-student.ts",
      "tests/e2e/notifications.spec.ts",
      "tests/e2e/announcements.spec.ts",
      "tests/e2e/reschedule.spec.ts",
      // T10: готовая справка Алисы из сида (токен), временная справка для отзыва и её уборка
      "tests/e2e/certificates.spec.ts",
    ],
    rules: { "@typescript-eslint/no-restricted-imports": "off", "no-restricted-syntax": "off" },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
    // .claude/ — правила и хуки агента (не линтуем) и рабочие копии параллельных сессий (.claude/worktrees)
    ".claude/**",
    "src/generated/**",
  ]),
]);

export default eslintConfig;
