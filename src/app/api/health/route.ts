// Проверка живости для Docker healthcheck и smoke-теста после деплоя.
// Ничего не раскрывает: ни версий, ни окружения.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
