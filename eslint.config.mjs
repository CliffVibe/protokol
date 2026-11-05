import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      // S1 (docs/05-security.md): Prisma — только через репозитории с ctx
      "no-restricted-imports": [
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
              group: ["@prisma/client", "**/server/db"],
              message:
                "Prisma — только в src/server/repos/** и src/server/db.ts. Добавь функцию в репозиторий с ctx.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/server/repos/**", "src/server/db.ts", "prisma/**"],
    rules: { "no-restricted-imports": "off" },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
    ".claude/skills/**",
  ]),
]);

export default eslintConfig;
