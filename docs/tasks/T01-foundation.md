# T01. Фундамент и деплой

**Цель:** пустое приложение открывается по HTTPS-ссылке с VPS; в репо настроены линт, типы, тесты, CI.

## Сделать
- **Сначала:** `claude --version` ≥ последней; прочитать `docs/07-tooling.md`; `npm i -g typescript-language-server typescript`; включить плагины из `.claude/settings.json` (`/plugin`); `/mcp` → playwright и shadcn в статусе Connected.
- `pnpm create next-app@16.4.5`, затем зафиксировать версии в package.json без `^`; `pnpm-workspace.yaml` из каркаса не перезаписывать.
- Параметры create-next-app: TS, App Router, Tailwind, ESLint, `src/`; TypeScript `strict`.
- shadcn/ui init; lucide-react; шрифты Manrope + Inter через `next/font`.
- Vitest + Playwright. В `playwright.config.ts` два проекта: `desktop` (1280×800) и `mobile-360` (360×740, touch).
- `docker-compose.yml` (dev: только postgres) и `docker-compose.prod.yml` (app + db + caddy), `Dockerfile` (Next standalone, multi-stage), `Caddyfile`.
- `.env.example` по `docs/03-architecture.md`.
- GitHub Actions: `ci.yml` и `security.yml` уже в каркасе — довести до зелёного.
- `node --test .claude/hooks/guard.test.mjs` зелёный.
- Страница-заглушка с `ConceptBanner`.
- Скрипты в package.json из CLAUDE.md.

## Ручные шаги (человек)
- Купить/поднять VPS (российский провайдер), направить домен или использовать `<ip>.sslip.io`.
- Склонировать, положить `.env`, `docker compose -f docker-compose.prod.yml up -d --build`.
- Отправить ссылку друзьям в РФ (без VPN), собрать скриншоты → журнал.

## Приёмка
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` зелёные локально и в CI
- [ ] Ссылка открывается по HTTPS, сертификат валиден
- [ ] Открылась у ≥ 2 человек из РФ без VPN
- [ ] В репо нет `.env`
