# syntax=docker/dockerfile:1
# Образ собирается в GitHub Actions (.github/workflows/image.yml) и публикуется в GHCR.
# На VPS сборки нет: только docker compose pull (см. docs/03-architecture.md → «Деплой»).

FROM node:24-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1
# pnpm той же версии, что в package.json → packageManager
RUN npm install -g pnpm@11.28.10 && apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
# schema.prisma нужна postinstall-скрипту (prisma generate)
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Клиент Prisma генерируется заново из схемы (src/generated не копируется — см. .dockerignore)
RUN pnpm db:generate && pnpm build

# Инструменты для прода: миграции и пересев демо — `docker compose run --rm tools pnpm db:deploy | db:reset-demo`.
# Полные node_modules (Prisma CLI, tsx); в приложение не входит. Публикуется как :tools (image.yml).
FROM build AS tools
ENV NODE_ENV=production
USER node
CMD ["pnpm", "db:deploy"]

# Приложение (цель по умолчанию — последняя стадия)
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
