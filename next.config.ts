import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Минимальный server.js для Docker-образа (см. Dockerfile)
  output: "standalone",
  poweredByHeader: false,
  // Ссылки на несуществующие маршруты ловит TypeScript
  typedRoutes: true,
  // `next dev` не создаёт AGENTS.md: правило «читай node_modules/next/dist/docs/» уже в CLAUDE.md
  // (решение человека 06.11)
  agentRules: false,
  // Без плавающей «N» в углу: в dev она перекрывает интерфейс на телефоне и путает при показе
  // (решение человека 06.11). Ошибки сборки и рантайма Next показывает и без неё; в проде её нет.
  devIndicators: false,
  // TTF для PDF справки (T10) читаются с диска — без этого standalone-образ остался бы без шрифтов
  outputFileTracingIncludes: {
    // Ключ — glob по пути маршрута: скобки экранированы, иначе [number] — класс символов
    "/requests/\\[number\\]/pdf": ["./assets/fonts/**/*"],
  },
  // Заголовки безопасности (S6 из docs/05-security.md). CSP с nonce — в src/proxy.ts:
  // nonce нужен свой на каждый запрос, а здесь заголовки статические.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Для старых браузеров без CSP frame-ancestors
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // На http браузеры HSTS игнорируют; на проде его же ставит Caddy
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      {
        // Воркер (T11) — без кэша браузера: исправление доходит до телефонов со следующим визитом
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, max-age=0, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
