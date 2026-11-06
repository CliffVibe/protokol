// Запуск сида из командной строки: `pnpm db:seed` (полный пересев = db:reset-demo)
// или `pnpm db:reseed-schedule` (только пары, от сегодняшней даты). Логика — в run-seed.ts.
// Пароли тестовых аккаунтов — ТОЛЬКО из env (SEED_PASSWORD_*), в коде их нет (S2, хук guard.mjs).
import "dotenv/config";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { runSeed } from "./run-seed";

export { runSeed, type SeedOptions } from "./run-seed";

// Запуск как скрипт (prisma db seed / tsx prisma/seed.ts), а не импорт из тестов
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const only = process.argv.includes("--only=schedule") ? "schedule" : undefined;
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  runSeed(prisma, { only })
    .then((stats) => console.log("Сид готов:", stats))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
