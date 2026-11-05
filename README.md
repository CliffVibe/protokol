# Протокол — цифровой деканат (концепт)

> **Концепт для конкурса «Цифровой деканат будущего». Не является официальным сервисом МГИМО. Все данные вымышлены.**

Прототип личного кабинета студента: расписание, успеваемость, заявки и справки, уведомления — в одной ленте «Сейчас»; кабинет сотрудника деканата; справки с QR-проверкой.

## С чего начать
Человек: открой папку в Claude Code и отправь текст из `docs/process/00-first-message.md`.
Claude Code: прочитай `CLAUDE.md`, дальше — `/next-task` (начинается с `docs/tasks/T01-foundation.md`).

## Документы
| | |
|---|---|
| [00 ТЗ конкурса](docs/00-brief.md) | исходные требования и критерии жюри ([оригинал .docx](docs/00-brief.docx)) |
| [CLAUDE.md](CLAUDE.md) | правила для ИИ-агента |
| [01 Концепция](docs/01-concept.md) | проблема, сценарии, разделы, идеи |
| [02 План](docs/02-plan.md) | этапы и сроки |
| [03 Архитектура](docs/03-architecture.md) | стек, данные, деплой |
| [04 Дизайн](docs/04-design.md) | визуальный язык |
| [05 Безопасность](docs/05-security.md) | инварианты |
| [06 Сид-данные](docs/06-seed-data.md) | тестовые аккаунты |
| [07 Инструменты](docs/07-tooling.md) | проверенные плагины, MCP, скиллы |
| [Задачи](docs/tasks/README.md) | постановки T01–T14 |
| [Журнал](docs/process/journal.md) | процесс для жюри |

## Агенты и команды Claude Code
- Субагенты: `security-reviewer`, `ux-reviewer`, `mobile-qa` (`.claude/agents/`)
- Команды: `/next-task`, `/check`, `/log`, `/deploy` (`.claude/commands/`)
- MCP: `playwright`, `shadcn` (`.mcp.json`, версии зафиксированы)
- Плагины Anthropic: typescript-lsp, frontend-design, pr-review-toolkit, claude-security; security-guidance — выключен по умолчанию (см. `docs/07-tooling.md`)
- Скиллы: `react-best-practices`, `web-interface-guidelines` (`.claude/skills/`)
- Хуки: `guard.mjs` (защита), `format.mjs` (форматирование)

## Первый запуск
1. Рекомендуется WSL2 (песочница Claude Code, Docker, pnpm). На нативном Windows: в `.mcp.json` заменить `"command": "npx"` на `"command": "cmd"` и добавить `"/c", "npx"` в начало `args`.
2. `claude update`, затем `npm i -g typescript-language-server typescript pnpm@11`.
3. `claude` в папке проекта → доверить папку → `/plugin` (включить плагины из settings) → `/mcp` (проверить серверы).
4. `/next-task`.
