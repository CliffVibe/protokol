// Проверка живости для Docker healthcheck и smoke-теста после деплоя.
// Ничего не раскрывает: ни версий, ни окружения, ни текста ошибок — только два флага.
import { pingDb } from "@/server/repos/system";

export const dynamic = "force-dynamic";

export async function GET() {
  const dbOk = await pingDb();
  return Response.json(
    { ok: dbOk, db: dbOk },
    { status: dbOk ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
