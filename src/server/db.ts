// Единственный PrismaClient приложения. Импортировать можно ТОЛЬКО из src/server/repos/**
// (ESLint no-restricted-imports + хук guard.mjs, docs/05-security.md → S1).
import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

function createClient() {
  // Prisma 7: драйвер-адаптер обязателен; строка подключения — только из env сервера (S4)
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

// В dev горячая перезагрузка пересоздаёт модули — держим один клиент на процесс
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
