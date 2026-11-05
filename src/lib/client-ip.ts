// IP клиента для блокировки входа по «логин + IP» (S2).
//
// Берём ПОСЛЕДНИЙ адрес из X-Forwarded-For — его добавил ближайший к приложению прокси.
// На проде это Caddy: заголовок от непроверенного клиента он не продолжает, а заменяет адресом
// соединения, а порт приложения наружу не открыт (docker-compose.prod.yml → expose).
// Next сам ставит X-Forwarded-For = адрес сокета, если заголовка нет. Локально (без Caddy) заголовок
// можно подделать — это допустимо: блокировка лишь замедляет перебор, доступ проверяет сессия.

export function clientIpFrom(forwardedFor: string | null | undefined): string {
  const parts = (forwardedFor ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const last = parts.at(-1);
  // Ограничиваем длину: значение уходит только в sha256, но мусор на мегабайт не нужен
  return last ? last.slice(0, 64) : "unknown";
}
