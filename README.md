# Протокол — цифровой деканат (концепт)

> **Концепт для конкурса. Не является официальным сервисом МГИМО. Все данные вымышлены.**

Прототип личного кабинета студента и кабинета сотрудника деканата для конкурса «Цифровой деканат будущего» (вуз-пример — МГИМО). Расписание, успеваемость, заявки и справки, уведомления — в одной ленте «Сейчас»; кабинет сотрудника деканата; справки с QR-проверкой подлинности; ИИ-помощник деканата. Весь код написан ИИ-агентом Claude Code под руководством человека.

## Посмотреть

| | |
|---|---|
| Работающий прототип | https://141-133-186-165.sslip.io |
| Отчёт для жюри (PDF) | [docs/report/protokol-report.pdf](docs/report/protokol-report.pdf) |
| Видео-демонстрация (4:15) | https://disk.yandex.ru/i/oNWdh70eplmvcQ |

## Тестовые аккаунты

| Логин | Роль | Кто |
|---|---|---|
| `student.alisa` | студент | Алиса Петрова, ФМО, 2 курс — стипендия сохраняется, есть готовая справка |
| `student.timur` | студент | Тимур Галиев, МЭО, 4 курс — задолженность и пересдача, стипендия не назначена |
| `student.new` | студент | Вера Соколова, МЖ, 1 курс — «пустой» студент для пустых состояний |
| `staff.irina` | сотрудник деканата | Ирина Морозова, деканат ФМО и МЭО |

Пароли — в описании работы (в репозитории их нет). На странице входа есть демо-кнопки «Войти как Алиса / Тимур / Вера / Ирина». Подробнее — [docs/06-seed-data.md](docs/06-seed-data.md).

## Документы
| | |
|---|---|
| [00 ТЗ конкурса](docs/00-brief.md) | исходные требования и критерии жюри ([оригинал .docx](docs/00-brief.docx)) |
| [CLAUDE.md](CLAUDE.md) | правила для ИИ-агента |
| [01 Концепция](docs/01-concept.md) | проблема, сценарии, разделы, идеи |
| [02 План](docs/02-plan.md) | этапы и сроки |
| [03 Архитектура](docs/03-architecture.md) | стек, данные, деплой, лицензии |
| [04 Дизайн](docs/04-design.md) | визуальный язык |
| [05 Безопасность](docs/05-security.md) | инварианты |
| [06 Сид-данные](docs/06-seed-data.md) | тестовые аккаунты |
| [07 Инструменты](docs/07-tooling.md) | проверенные плагины, MCP, скиллы |
| [Задачи](docs/tasks/README.md) | постановки T01–T14 |
| [Журнал](docs/process/journal.md) | процесс для жюри |
| [Ключевые промпты](docs/process/prompts.md) | промпты, которые сильнее всего повлияли на результат |
| [Ошибки ИИ](docs/process/ai-errors.md) | что ИИ сделал не так и как это поймали |
| [ИИ-инструменты](docs/process/tools.md) | полный перечень инструментов и сервисов |

## Быстрый запуск для разработчика

Стек: Next.js 16, React 19, TypeScript, Tailwind CSS 4, PostgreSQL 16, Prisma 7, pnpm 11, Node 24 (подробно — [docs/03-architecture.md](docs/03-architecture.md)).

```bash
pnpm install
# .env — по образцу .env.example (пароли тестовых аккаунтов SEED_PASSWORD_* задаёте сами)
docker compose up -d db
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Проверки: `pnpm format:check && pnpm lint && pnpm typecheck`, `pnpm test` (Vitest), `pnpm test:e2e` (Playwright: десктоп и мобильный 360px). Остальные команды — в [CLAUDE.md](CLAUDE.md) → «Команды».

### Первый запуск Claude Code в проекте
1. Рекомендуется WSL2 (песочница Claude Code, Docker, pnpm). На нативном Windows: в `.mcp.json` заменить `"command": "npx"` на `"command": "cmd"` и добавить `"/c", "npx"` в начало `args`.
2. `claude update`, затем `npm i -g typescript-language-server typescript pnpm@11`.
3. `claude` в папке проекта → доверить папку → `/plugin` (включить плагины из settings) → `/mcp` (проверить серверы).
4. `/next-task`.

## Как мы работали с ИИ

Правила для агента — в [CLAUDE.md](CLAUDE.md): стек, железные правила безопасности, определение «готово», журнал процесса. Как начать работу с агентом:

- Человек: открой папку в Claude Code и отправь текст из `docs/process/00-first-message.md`.
- Claude Code: прочитай `CLAUDE.md`, дальше — `/next-task` (начинается с `docs/tasks/T01-foundation.md`).

Агенты и команды Claude Code:
- Субагенты: `security-reviewer`, `ux-reviewer`, `mobile-qa` (`.claude/agents/`)
- Команды: `/next-task`, `/check`, `/log`, `/deploy` (`.claude/commands/`)
- MCP: `playwright`, `shadcn` (`.mcp.json`, версии зафиксированы)
- Плагины Anthropic: typescript-lsp, frontend-design, pr-review-toolkit, claude-security; security-guidance — выключен по умолчанию (см. `docs/07-tooling.md`)
- Скиллы: `react-best-practices`, `web-interface-guidelines` (`.claude/skills/`)
- Хуки: `guard.mjs` (защита), `format.mjs` (форматирование)

Ход работы, промпты и ошибки ИИ — в [журнале](docs/process/journal.md), [промптах](docs/process/prompts.md) и [ai-errors.md](docs/process/ai-errors.md).

## Лицензия

Лицензия — MIT, файл [LICENSE](LICENSE). Лицензии сторонних библиотек, шрифтов и инструментов — [docs/03-architecture.md](docs/03-architecture.md) → «Лицензии сторонних материалов».
