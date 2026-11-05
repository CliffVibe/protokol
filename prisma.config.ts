// Prisma 7: строка подключения живёт здесь, а не в schema.prisma (см. docs/03-architecture.md).
// .env сам не читается — подключаем dotenv. Значения секретов агенту не нужны: шаблон — .env.example.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Без DATABASE_URL работает только `prisma generate` (CI, сборка образа) — как советует документация Prisma 7.
    url: process.env.DATABASE_URL ?? "",
  },
});
