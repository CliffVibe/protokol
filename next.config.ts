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
  // Заголовки безопасности (S6 из docs/05-security.md) — в T03
};

export default nextConfig;
