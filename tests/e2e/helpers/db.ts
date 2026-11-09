// Прямой доступ к БД в e2e — только для проверок, которые иначе не сделать честно (двойная отправка),
// и для уборки за собой. С T13 e2e работают в своей базе protokol_e2e (e2e-db.ts), не в демо человека;
// заявки, которые создал тест, тест всё равно удаляет (T08): параллельные тесты видят общую базу.
import pg from "pg";
import { assertE2eDatabase, e2eDatabaseUrl } from "../e2e-db";

/** Только локальная база e2e: ни прод, ни демо-база человека уборкой не задеваются. */
export function e2eDb(): string {
  return assertE2eDatabase(e2eDatabaseUrl());
}

export async function withDb<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: e2eDb() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Удалить заявки, созданные тестом: уведомления по ним, выданный документ, саму заявку (события — каскадом). */
export async function deleteTestRequests(numbers: string[]): Promise<void> {
  if (!numbers.length) return;
  await withDb(async (c) => {
    const links = numbers.map((n) => `/requests/${encodeURIComponent(n)}`);
    await c.query("BEGIN");
    try {
      await c.query(`DELETE FROM "Notification" WHERE link = ANY($1)`, [links]);
      await c.query(
        `DELETE FROM "IssuedDocument" WHERE "requestId" IN (SELECT id FROM "Request" WHERE number = ANY($1))`,
        [numbers],
      );
      await c.query(`DELETE FROM "Request" WHERE number = ANY($1)`, [numbers]);
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    }
  });
}
