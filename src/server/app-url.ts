import "server-only";

// Публичный адрес приложения — для ссылки в QR справки (T10). Только сервер, без NEXT_PUBLIC_ (S4).
// Нет APP_URL или он не http(s) — localhost (dev). Хвостовой «/» отрезаем.
export function appUrl(): string {
  const raw = process.env.APP_URL ?? "";
  try {
    const u = new URL(raw);
    if (u.protocol === "https:" || u.protocol === "http:") return u.origin;
  } catch {
    // ниже — запасной адрес
  }
  return "http://localhost:3000";
}

export const verifyUrl = (token: string) => `${appUrl()}/verify/${token}`;
