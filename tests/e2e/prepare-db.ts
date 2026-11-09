// Подготовка базы e2e перед сборкой сервера (T13): создать, если нет → миграции → свежий сид.
// Запускается из webServer.command в playwright.config.ts: сервер Playwright стартует раньше globalSetup,
// а /api/health без базы отвечает 503 — поэтому подготовка идёт в той же команде до `pnpm build`.
// Пароли тестовых аккаунтов сид берёт из SEED_PASSWORD_* окружения; значения не печатаются.
import "dotenv/config";
import { execSync } from "node:child_process";
import pg from "pg";
import { assertE2eDatabase, e2eDatabaseUrl } from "./e2e-db";

async function main() {
  const url = assertE2eDatabase(e2eDatabaseUrl());
  const name = new URL(url).pathname.slice(1);
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) throw new Error(`Странное имя базы e2e: «${name}»`);

  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (!rowCount) {
      // Имя проверено регуляркой выше: в CREATE DATABASE параметры не подставляются
      await client.query(`CREATE DATABASE "${name}"`);
      console.log(`[e2e] создана база ${name}`);
    }
  } finally {
    await client.end();
  }

  const env = { ...process.env, DATABASE_URL: url };
  execSync("pnpm exec prisma migrate deploy", { stdio: "inherit", env });
  execSync("pnpm db:seed", { stdio: "inherit", env });
  console.log(`[e2e] база ${name} готова: миграции применены, сид свежий`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
