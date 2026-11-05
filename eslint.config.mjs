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
              group: ["**/server/db"],
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
    },
  },
  {
    // Где работа с БД разрешена: репозитории, клиент, сид/миграции и интеграционные тесты
    files: ["src/server/repos/**", "src/server/db.ts", "prisma/**", "tests/integration/**"],
    rules: { "@typescript-eslint/no-restricted-imports": "off" },
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
