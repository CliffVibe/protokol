// proxy.ts (в Next 16 так называется middleware). ТРИ задачи, и ни одна из них не проверка доступа:
//  1. Удобство: без cookie сессии — сразу на /login. Доступ ВСЕГДА проверяют requireStudent()/requireStaff()
//     на сервере (docs/05-security.md → S1; история CVE-2025-29927 — обход middleware заголовком).
//  2. CSP с nonce (S6): по документации Next 16.4 (guides/content-security-policy.md) nonce на каждый
//     запрос можно выдать только здесь; статический CSP в next.config.ts сломал бы inline-скрипты Next.
//  3. Битая %-последовательность в пути (/requests/%E0%A4) — сразу 400: иначе Next падает на разборе
//     параметров страницы с 500 (T08).
// Остальные заголовки S6 — в next.config.ts.
import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  SESSION_TTL_MS,
  isWellFormedToken,
} from "@/server/auth/tokens";

/** Пути, открытые без входа (кроме статики — её отсекает matcher). */
const PUBLIC_PATHS = [/^\/login\/?$/, /^\/verify\//, /^\/api\/calendar\//, /^\/api\/health\/?$/];

export function buildCsp(nonce: string, { dev, https }: { dev: boolean; https: boolean }): string {
  return [
    "default-src 'self'",
    // 'unsafe-eval' — только в dev: React восстанавливает серверные стеки ошибок через eval
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // В dev Turbopack вставляет <style> без nonce (горячая замена CSS). При nonce браузер игнорирует
    // 'unsafe-inline', поэтому в dev — без nonce. На проде CSS приходит файлами, nonce обязателен.
    dev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    // Service worker (T11): при 'strict-dynamic' в script-src слово 'self' там не действует, а worker-src
    // без своей директивы берёт script-src — регистрация /sw.js упала бы. Поэтому — явно.
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/** Путь декодируется без ошибки (нет битых %-последовательностей). */
export function isWellFormedPath(pathname: string): boolean {
  try {
    decodeURIComponent(pathname);
    return true;
  } catch {
    return false;
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!isWellFormedPath(pathname)) {
    return new NextResponse("Неверный адрес", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const isPublic = PUBLIC_PATHS.some((re) => re.test(pathname));

  if (!token && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, {
    dev: process.env.NODE_ENV === "development",
    https: (process.env.APP_URL ?? "").startsWith("https://"),
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);

  // «Продление при активности» (S3): обновляем срок cookie на переходах по страницам.
  // Срок в БД продлевает getSession(); недействительный токен отсюда всё равно никуда не пустит.
  // Мусор вместо токена не продлеваем (security-reviewer, T03)
  if (
    isWellFormedToken(token) &&
    request.method === "GET" &&
    !request.headers.has("next-router-prefetch")
  ) {
    response.cookies.set(SESSION_COOKIE, token, {
      ...SESSION_COOKIE_OPTIONS,
      maxAge: SESSION_TTL_MS / 1000,
    });
  }
  return response;
}

export const config = {
  matcher: [
    // Всё, кроме статики Next, значков, robots и файлов PWA (T11) — им не нужны ни редирект, ни nonce.
    // Манифест, воркер и офлайн-страницу браузер берёт и без входа (на странице входа, при обновлении воркера)
    "/((?!_next/static|_next/image|icon.svg|apple-icon.png|icons/|favicon.ico|robots.txt|manifest.webmanifest|sw.js|offline.html|offline.css).*)",
  ],
};
