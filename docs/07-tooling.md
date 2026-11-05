# 07. Инструменты для Claude Code и их проверка безопасности

Ресерч и проверка проведены 05.11.2026. Каждый инструмент проверен по шести пунктам:

1. **Издатель.** Кто публикует пакет: организация или аноним. Совпадают ли мейнтейнеры npm с репозиторием.
2. **Лицензия.** Можно ли использовать в конкурсной работе.
3. **Свежесть.** Когда был последний релиз, поддерживается ли проект.
4. **Уязвимости.** Известные CVE и инциденты, результат `npm audit` для зафиксированной версии.
5. **Поведение.** Что запускается: install-скрипты, хуки, сетевые запросы, телеметрия. Для плагинов Anthropic **прочитан исходный код хуков**.
6. **Права.** Что инструмент может сделать с проектом и машиной, и можно ли это сузить.

Итог: **13 инструментов одобрено** (плюс встроенные возможности Claude Code и настройки pnpm), **4 условно**, **6 отклонено**.

---

## ✅ Одобрено (уже настроено в каркасе)

### Встроенные возможности Claude Code
| Что | Где у нас | Зачем |
|---|---|---|
| Plan mode | `/next-task` → план → одобрение | Скриншоты планов идут в отчёт |
| Субагенты | `.claude/agents/` (3 шт.) | Ревью безопасности, UX, мобильный QA |
| Slash-команды | `.claude/commands/` (4 шт.) | Повторяемый процесс |
| Хуки | `.claude/hooks/guard.mjs`, `format.mjs` | Инварианты безопасности соблюдаются автоматически |
| Права | `.claude/settings.json` → `permissions` | Запрет чтения `.env`, опасные команды только через «спросить» |
| `/security-review` | встроенная команда | Быстрый скан перед коммитом |

**Требование:** Claude Code **≥ 2.1.x последней версии** (на 05.11.2026 — 2.1.318). В старых версиях есть две уязвимости:
- CVE-2025-59536: хуки из чужого `.claude/settings.json` выполнялись до диалога доверия. Исправлено в 1.0.111.
- CVE-2026-21852: подмена `ANTHROPIC_BASE_URL` позволяла утащить ключ API. Исправлено в 2.0.65.

Проверить версию: `claude --version`.

### Плагины Anthropic из `claude-plugins-official`
Код всех пяти лежит в `./plugins/` официального репозитория, автор — Anthropic, лицензия Apache-2.0. Включаются через `enabledPlugins` в `.claude/settings.json` (security-guidance там стоит в `false`).

| Плагин | Что делает | Проверка поведения | Вердикт |
|---|---|---|---|
| **security-guidance** | 3 слоя: regex-предупреждения при правках (~25 опасных паттернов), LLM-ревью диффа в конце каждого хода, агентное ревью на `git commit` (ловит IDOR и обход авторизации между файлами) | Прочитаны `hooks.json` и Python-хуки. Сеть: только `api.anthropic.com` с твоей учёткой Claude Code. При старте сессии ставит `claude-agent-sdk` с PyPI. Нужен Python 3.8+ | ⏸ **Выключен по умолчанию** (`enabledPlugins: false`): LLM-ревью в конце каждого хода тратит лимиты на Opus. Включаем на задачи с данными и входом (T03, T08, T10, T12): в `.claude/settings.local.json` прописать `{"enabledPlugins": {"security-guidance@claude-plugins-official": true}}`, после задачи удалить. Чтобы оставить только ревью коммитов — `ENABLE_STOP_REVIEW=0` |
| **frontend-design** | Скилл про нешаблонный дизайн | Только markdown, кода нет | ✅ Приоритет у `docs/04-design.md` |
| **typescript-lsp** | Переход к определению, поиск ссылок, ошибки типов для агента | Конфиг LSP, запускает `typescript-language-server` | ✅ Нужно `npm i -g typescript-language-server typescript` |
| **pr-review-toolkit** | Агенты: silent-failure-hunter, pr-test-analyzer, type-design-analyzer и другие | Только markdown-агенты | ✅ Дополняет наших трёх ревьюеров |
| **claude-security** | Глубокий скан уязвимостей командой агентов; каждую находку проверяет отдельный верификатор; патчи применяешь сам | Хуки только показывают баннер и подсказки, сеть — только ссылки на документацию. Работает в твоей сессии с твоими правами | ✅ Запускать **на этапах T13 и T14** (дорого по токенам). Отчёт идёт в документ для жюри |

### MCP-серверы (файл `.mcp.json`, версии зафиксированы)
| Сервер | Издатель / лицензия | Версия | Аудит | Как ограничили |
|---|---|---|---|---|
| **Playwright MCP** | Microsoft, Apache-2.0 | `0.0.84` (03.11.2026) | 0 находок, install-скриптов нет | `--isolated` (профиль в памяти), `--headless`, `--allowed-origins` только localhost:3000, вьюпорт 390px. **Не включаем** `--caps devtools`. Инструмент `browser_run_code_unsafe` («эквивалент RCE» по README) в 0.0.84 доступен без флагов, поэтому закрыт правилом `deny` в `.claude/settings.json` (проверено 05.11.2026) |
| **shadcn MCP** | shadcn / Vercel, MIT | `4.23.0` (27.10.2026) | 2 умеренные (deepmerge, minimatch) — только dev-CLI, на сборку не влияют | Только официальный реестр. **Не добавляем** сторонние реестры в `components.json` |

Почему версии зафиксированы, а не `@latest`: `@latest` каждый запуск подтягивает свежий код. Если пакет взломают, это сразу попадёт к агенту. Обновляем вручную и с ревью.

Почему `enableAllProjectMcpServers: false` и белый список `enabledMcpjsonServers`: так новый сервер не включится молча, если кто-то допишет его в `.mcp.json`.

### Скиллы (скопированы в репозиторий и зафиксированы)
| Скилл | Откуда | Что изменили |
|---|---|---|
| `react-best-practices` | vercel-labs/agent-skills, MIT, коммит `1a2c79d` | Ничего. Проверено: только md и json |
| `web-interface-guidelines` | vercel-labs/web-interface-guidelines, MIT, коммит `434b7f9` | **Убрали скачивание правил из сети при каждом запуске** (оригинал делает WebFetch на GitHub). Это канал подмены инструкций — теперь правила лежат локально |

### Документация Next.js без сети
Next.js 16 кладёт 474 файла документации, совпадающей с установленной версией, в `node_modules/next/dist/docs/`. Это проверено распаковкой пакета 16.4.5. Агенту не нужен ни Context7, ни next-devtools-mcp: правило в `CLAUDE.md` велит читать документацию отсюда.

### Тесты и CI
| Инструмент | Лицензия | Версия | Где |
|---|---|---|---|
| `@axe-core/playwright` (Deque) | MPL-2.0 (только dev, код не распространяем) | 4.14.0 | e2e-тесты доступности |
| gitleaks | MIT | v8.30.1, action v3 | `security.yml`: секреты во всей истории git. Для личного репо лицензия не нужна |
| Semgrep CLI (OSS) | LGPL-2.1 | 1.183.0 (docker) | `security.yml`, правила TypeScript/React/OWASP/secrets, `--metrics=off` |
| `pnpm audit --prod` | — | — | `security.yml` |
| Dependabot | GitHub | — | `.github/dependabot.yml` |

### Защита зависимостей (pnpm 11, `pnpm-workspace.yaml`)
- `minimumReleaseAge: 4320` — не ставить версии моложе 3 дней. Вредоносные релизы вроде червя Shai-Hulud обычно снимают за часы.
- `trustPolicy: no-downgrade` — установка падает, если у пакета пропало подтверждение происхождения (provenance) или упал уровень доверия.
- `strictDepBuilds` + `allowBuilds` — install-скрипты разрешены только `prisma`, `@prisma/engines` и `esbuild`. Проверено по `npm view`: у остальных скриптов нет.
- `blockExoticSubdeps: true` — транзитивные зависимости только из реестра.

### Зафиксированные версии стека (проверены `npm audit`: 0 уязвимостей в prod-зависимостях)
| Пакет | Версия | Примечание |
|---|---|---|
| next | **16.4.5** | Не ниже 16.0.7: уязвимость React2Shell (CVE-2025-55182, RCE в Server Components) и последующие DoS-CVE исправлены. В 16 `middleware.ts` → **`proxy.ts`** |
| react / react-dom | 19.3.1 | Не ниже 19.2.8 / 19.1.9 (CVE-2026-44907) |
| prisma / @prisma/client | **7.10.1** | ⚠️ npm-тег `latest` у `prisma` указывает на **8.0.0-rc.30** (релиз-кандидат). Ставить строго `prisma@7.10.1` |
| @node-rs/argon2 | 2.2.2 | Готовые бинарники, install-скриптов нет |
| @react-pdf/renderer | 4.9.0 | |

---

## ⚠️ Условно (не включено по умолчанию; включаем на конкретном этапе)

| Инструмент | Почему условно | Как использовать безопасно |
|---|---|---|
| **chrome-devtools-mcp** (Google, Apache-2.0, 1.12.0, аудит чистый) | Телеметрия включена по умолчанию. CrUX отправляет URL в Google. Есть доступ к cookie и вкладкам браузера | Только на T13 для трейсов производительности и Lighthouse: `claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@1.12.0 --isolated --headless --no-usage-statistics --no-performance-crux`. Убрать после этапа |
| **Context7** (Upstash, MIT) | В марте 2026 раскрыта уязвимость ContextCrush: «AI-инструкции» от авторов библиотек без фильтрации уходили агенту, PoC крал `.env`. Исправлено 23.02.2026, но канал остался: в контекст агента попадает текст третьих лиц | Для Next не нужен (есть локальная документация). Для Prisma 7 и Tailwind 4 — только если агент буксует, на одну сессию, при включённых запретах чтения `.env`. Предпочитай официальную документацию через WebFetch |
| **claude-code-security-review** (GitHub Action, Anthropic, MIT) | Нужен платный ключ API. README прямо пишет: **не защищён от prompt injection**, только для доверенных PR | Только если будет ключ API и только на наши PR. Без него хватает `/security-review` и плагина claude-security локально |
| **Песочница Claude Code** (`sandbox.enabled`) | На нативном Windows не работает, только macOS, Linux и WSL2 | Рекомендация: разрабатывать в **WSL2**. Там же лучше работают Docker, pnpm и Prisma. В WSL2 добавь в `.claude/settings.local.json`: `{"sandbox": {"enabled": true}}` |

---

## ❌ Отклонено

| Инструмент | Причина |
|---|---|
| **next-devtools-mcp** (Vercel) | Последний релиз 0.4.0 от 24.06.2026 (не обновляется больше 4 месяцев). Тянет уязвимые `@modelcontextprotocol/sdk` (утечка данных между клиентами, отправка OAuth-учётных данных) и `zod` (исчерпание памяти), исправления нет. Телеметрия включена по умолчанию. Пользу (документация по версии) даёт `node_modules/next/dist/docs/` |
| **Плагин и MCP Prisma** | Удалённый сервер с аккаунтом Prisma Postgres. Есть разрушительные инструменты (`migrate-reset --force`, удаление БД). Нам хватает CLI, а `migrate reset` закрыт хуком и правилом «спросить» |
| **Плагин Semgrep (Guardian)** | Закрытый бинарник, скачивается с semgrep.dev, нужен вход в аккаунт, телеметрия. Заменён OSS-CLI в CI |
| **Плагин Vercel / скилл deploy-to-vercel** | Хостим на российском VPS, а не на Vercel |
| **@lhci/cli** (Lighthouse CI) | 12 high-находок в транзитивных зависимостях (цепочка puppeteer → proxy-agent → basic-ftp). Заменён на `lighthouse_audit` из chrome-devtools-mcp на этапе T13 |
| **Сторонние маркетплейсы скиллов и MCP** (skills.sh, smithery, lobehub и т. п.) | Их никто не проверяет, звёзды накручиваются. Берём только из `claude-plugins-official/plugins` (Anthropic) или от вендора самого инструмента |

---

## Правила для агента и человека

1. **Новый инструмент — только через этот файл.** Сначала прогнать 6 пунктов проверки, записать вердикт, потом подключать.
2. **Версии фиксируем.** Никаких `@latest` в `.mcp.json` и CI. Обновление — отдельный коммит с причиной.
3. **`.claude/` и `.mcp.json` — это исполняемый код.** Любое изменение в них человек ревьюит глазами.
4. **Никаких чужих репозиториев с `.claude/`** в рабочей папке без просмотра их хуков.
5. **Секреты агенту не нужны.** Тестовые пароли и ключи знает только человек. Агент работает с `.env.example`.
6. **Обновлять Claude Code** перед каждым этапом: `claude update`.

## Источники
- Официальный каталог плагинов: github.com/anthropics/claude-plugins-official (`.claude-plugin/marketplace.json`, исходники `plugins/*`)
- CVE Claude Code: mintive.com/blog/claude-code-cve
- ContextCrush: noma.security (через hn.jakechampion.name), beyondmachines.net
- Слабость MCP в STDIO (OX Security): thehackernews.com/2026/04/anthropic-mcp-design-vulnerability.html
- Playwright MCP README: github.com/microsoft/playwright-mcp
- Chrome DevTools MCP README: github.com/ChromeDevTools/chrome-devtools-mcp
- next-devtools-mcp: github.com/vercel/next-devtools-mcp
- shadcn MCP: ui.shadcn.com/docs/mcp
- Prisma MCP: archestra.ai/mcp-catalog/prisma__mcp
- claude-code-security-review: github.com/anthropics/claude-code-security-review
- React2Shell: wz-it.com/en/blog/react2shell-nextjs-critical-vulnerability
- pnpm: pnpm.io/settings/dependency-resolution, pnpm.io/settings/build; lilting.ch (minimumReleaseAge в pnpm 11)
- Настройки Claude Code: code.claude.com/docs/en/settings, code.claude.com/docs/en/sandboxing
- gitleaks: kunalganglani.com/blog/gitleaks-pre-commit-ci-setup
- Метаданные npm и `npm audit` — запущены 05.11.2026
