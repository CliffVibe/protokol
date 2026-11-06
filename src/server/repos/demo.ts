import "server-only";
import { db } from "@/server/db";
import { runSeed } from "../../../prisma/seed";
import type { StaffCtx } from "./auth";

// «Сбросить демо» (T08): та же логика, что у `pnpm db:reset-demo` и ночного cron, — полный пересев
// вымышленных данных от текущей даты. Пароли демо-аккаунтов — из process.env на сервере (S2, S4).
// Вызывается только из resetDemoAction: сотрудник + DEMO_MODE=1 проверены там.

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- ctx — подтверждение, что вызвано из-под requireStaff
export async function resetDemoData(ctx: StaffCtx): Promise<void> {
  await runSeed(db, { now: new Date() });
}
