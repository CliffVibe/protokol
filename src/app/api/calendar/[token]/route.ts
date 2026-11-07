import { parseCalendarSegment } from "@/lib/calendar-token";
import { calendarFeed } from "@/server/services/calendar";

// Подписка на расписание (T11, S7): GET /api/calendar/<token>.ics — без входа, календарь (Google, iPhone)
// перечитывает ссылку сам. Доступ даёт только токен 256 бит (repos/calendar.ts — исключение «без ctx»).
// Битый формат → 404 без запроса к БД; неизвестный или перевыпущенный токен → тот же 404 без тела:
// не различаем «не было» и «перевыпущен». В ответе — только пары, ничего о студенте.
export const dynamic = "force-dynamic";

const notFound = () =>
  new Response(null, { status: 404, headers: { "cache-control": "no-store" } });

export async function GET(_req: Request, { params }: RouteContext<"/api/calendar/[token]">) {
  const token = parseCalendarSegment((await params).token);
  if (!token) return notFound();
  const ics = await calendarFeed(token, new Date());
  if (ics === null) return notFound();
  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="protokol.ics"',
      // Личная ссылка: ни прокси, ни общий кэш не должны её хранить
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
