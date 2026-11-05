# T01. Фундамент и деплой

**Цель:** пустое приложение открывается по HTTPS-ссылке с VPS; в репо настроены линт, типы, тесты, CI.

## Сделать
- **Сначала:** `claude --version` ≥ последней; прочитать `docs/07-tooling.md`; `npm i -g typescript-language-server typescript`; включить плагины из `.claude/settings.json` (`/plugin`); `/mcp` → playwright и shadcn в статусе Connected.
- Скелет Next.js собираем руками (то же, что даёт create-next-app: TS strict, App Router, Tailwind, ESLint, `src/`), версии без `^`, `"packageManager": "pnpm@11.28.10"`; `pnpm-workspace.yaml` из каркаса не перезаписывать.
- 05.11 стартуем на **next 16.4.4**: 16.4.5 пропустит `minimumReleaseAge` только 06.11 после 21:02 МСК. Подъём до 16.4.5 — отдельным коммитом.
- TypeScript 6.0.3 (TS 7 — нативный, без tsserver; совместимость с LSP и Next не проверена).
- ESLint `no-restricted-imports`: `@/server/db` только из `src/server/repos/**`, `src/server/db.ts`, `prisma/**` (перенесено из T02: страховка на случай записи файлов в обход хука). Prettier — нужен хуку `format.mjs`.
- shadcn/ui init; lucide-react; шрифты Manrope + Inter через `next/font`.
- Vitest + Playwright. В `playwright.config.ts` два проекта: `desktop` (1280×800) и `mobile-360` (360×740, touch).
- `docker-compose.yml` (dev: только postgres) и `docker-compose.prod.yml` (app + db + caddy), `Dockerfile` (Next standalone, multi-stage), `Caddyfile`.
- `.env.example` по `docs/03-architecture.md`.
- GitHub Actions: `ci.yml` и `security.yml` уже в каркасе — довести до зелёного: actions закрепить по SHA актуальных версий, шаги с Prisma — только если есть `prisma/schema.prisma`.
- `image.yml`: сборка образа в CI и публикация в GHCR; VPS только скачивает образ (`next build` на 2 ГБ RAM может не влезть).
- `node --test .claude/hooks/guard.test.mjs` зелёный.
- Страница-заглушка с `ConceptBanner`.
- Скрипты в package.json из CLAUDE.md.

## Ручные шаги (человек)
- Купить/поднять VPS (российский провайдер), направить домен или использовать `<ip>.sslip.io`.
- На VPS: Docker Engine, `registry-mirrors: ["https://mirror.gcr.io"]` в `/etc/docker/daemon.json`, swap 2 ГБ, проверка `docker pull postgres:16`.
- Склонировать, положить `.env`, `docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d`.
- Отправить ссылку друзьям в РФ (без VPN), собрать скриншоты → журнал.

## Приёмка
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` зелёные локально и в CI
- [ ] Ссылка открывается по HTTPS, сертификат валиден
- [ ] Открылась у ≥ 2 человек из РФ без VPN
- [ ] В репо нет `.env`
