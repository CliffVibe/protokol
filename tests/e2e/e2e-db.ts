// Отдельная база для e2e (T13): прогон пересеивает её с нуля и не трогает демо-базу человека,
// в которой во время прогона Тимур видел тестовое объявление МЭО (ревью T09).
// Адрес — из DATABASE_URL с другим именем базы: в .env ничего добавлять не нужно.
// E2E_DATABASE_URL — явная строка, если база e2e живёт в другом месте.
export const E2E_DB_NAME = "protokol_e2e";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "[::1]", "db"];

export function e2eDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.E2E_DATABASE_URL) return env.E2E_DATABASE_URL;
  if (!env.DATABASE_URL) throw new Error("Для e2e нужен DATABASE_URL (база e2e строится из него)");
  const url = new URL(env.DATABASE_URL);
  url.pathname = `/${E2E_DB_NAME}`;
  return url.toString();
}

/**
 * Пересев и уборка — только в локальной базе e2e: если e2e когда-нибудь запустят с прод-строкой
 * или с демо-базой, ни сид, ни уборка её не тронут.
 */
export function assertE2eDatabase(url: string, env: NodeJS.ProcessEnv = process.env): string {
  const parsed = new URL(url);
  if (!LOCAL_HOSTS.includes(parsed.hostname))
    throw new Error(`e2e ходят в БД только локально, а адрес указывает на «${parsed.hostname}»`);
  const expected = env.E2E_DATABASE_URL
    ? new URL(env.E2E_DATABASE_URL).pathname
    : `/${E2E_DB_NAME}`;
  if (parsed.pathname !== expected)
    throw new Error(
      `e2e работают только с базой «${expected.slice(1)}», а не «${parsed.pathname.slice(1)}»`,
    );
  return url;
}
