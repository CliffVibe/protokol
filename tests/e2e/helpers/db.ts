// Прямой доступ к БД в e2e — только для проверок, которые иначе не сделать честно (двойная отправка),
// и для уборки за собой. e2e работают с той же локальной базой, что и демо человека: заявки, которые
// создал тест, тест и удаляет (T08). Это уборка тестовых данных, а не продуктовое удаление заявок.
import pg from "pg";

export async function withDb<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
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
