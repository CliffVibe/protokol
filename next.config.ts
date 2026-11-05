import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Минимальный server.js для Docker-образа (см. Dockerfile)
  output: "standalone",
  poweredByHeader: false,
  // Ссылки на несуществующие маршруты ловит TypeScript
  typedRoutes: true,
  // Заголовки безопасности (S6 из docs/05-security.md) — в T03
};

export default nextConfig;
