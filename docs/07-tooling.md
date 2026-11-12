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
| prisma / @prisma/client / @prisma/adapter-pg | **7.9.0** | ⚠️ npm-тег `latest` у `prisma` — **8.0.0-rc.30**. 7.10.0–7.10.1 CLI опубликованы токеном `prismabot` без provenance (у 7.9.0 и 8.0-rc — GitHub Actions + SLSA) → `trustPolicy` отклонил; взяли 7.9.0 целиком (решение человека 06.11). Изменение 7.10 «Prisma Studio security hardening» нас не касается: Studio не используем |
| @node-rs/argon2 | 2.2.2 | Готовые бинарники, install-скриптов нет |
| @react-pdf/renderer | 4.9.0 | Проверен на T10 (06.11): Диего Мураччоле, MIT, provenance SLSA, релиз 27.08.2026, install-скриптов нет; дерево 53 пакета, ~33 МБ в node_modules; `pnpm audit --prod` — 0. В Next 16 уже во внешних серверных пакетах — в клиентский бандл не попадает |
| uqr | 0.1.3 | T10: unjs (pi0, antfu), MIT, 0 зависимостей, 79 КБ, релиз 03.04.2026, install-скриптов нет. Provenance нет ни у одной версии — `trustPolicy: no-downgrade` не срабатывает (понижения нет). Выбран вместо `qrcode` 1.5.4 (тянет yargs, pngjs; PNG и CLI нам не нужны) — решение человека 06.11 |

### Внешний сервис ИИ и сертификат (T12, 07.11)
| Что | Проверка | Как используем |
|---|---|---|
| **GigaChat API** (Сбер), ключ физлица, scope `GIGACHAT_API_PERS`, модель `GigaChat-2` (Lite) | **Без SDK**: хватает `fetch` (OAuth + SSE) — новой зависимости нет, проверять по цепочке поставок нечего | Ключ — только `.env` сервера (`GIGACHAT_AUTH_KEY`, вписывает человек); в промпт — только данные текущего студента (S8); лимит 20/ч; без ключа — режим FAQ. e2e — всегда `ASSISTANT_PROVIDER=faq` |
| **«Russian Trusted Root CA»** (Минцифры России) → `certs/russian_trusted_root_ca.pem` | Скачан с «да» человека 07.11 с `https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt` (CDN Госуслуг, ссылка со страницы `gosuslugi.ru/crt`). PEM, 2088 байт. Самоподписанный корневой: `CN=Russian Trusted Root CA, O=The Ministry of Digital Development and Communications, C=RU`, действует 01.03.2022 – 27.02.2032. SHA-256 сертификата `D2:6D:2D:02:31:B7:C3:9F:92:CC:73:85:12:BA:54:10:35:19:E4:40:5D:68:B5:BD:70:3E:97:88:CA:8E:CF:31`; SHA-256 файла: как скачан (CRLF) — `936a43fe…6afc6504`, в git (LF) — `08199775…3dbf0eb4`; отпечаток самого сертификата от концов строк не зависит | Только **дополнительно** к системным корневым — через `NODE_EXTRA_CA_CERTS` (образ, `pnpm start`). Проверку TLS не отключаем (`rejectUnauthorized`, `NODE_TLS_REJECT_UNAUTHORIZED` — запрещено). Проверено: без сертификата Node → `SELF_SIGNED_CERT_IN_CHAIN`, с ним `gigachat.devices.sberbank.ru` отвечает 401 (ждёт токен). Срок — до 2032, при перевыпуске Минцифры заменить файл |

### Что защита цепочки поставок поймала на T01 (05.11.2026) — для отчёта
| Что сработало | На чём | Что сделали |
|---|---|---|
| `minimumReleaseAge` | `next@16.4.5` (48 ч), `semver@6.3.2` | Стартовали на 16.4.4; установку dev-зависимостей отложили на час, пока `semver` не «созрел». Обход флагом запрещён и хуком, и `deny` |
| `trustPolicy: no-downgrade` | `undici-types@6.21.0` (нет provenance, у более ранних по дате — есть) | Политику не ослабляли: перешли на Node 24 и `@types/node@24` |
| `trustPolicy` | `eslint-import-resolver-typescript@3.10.1`, `semver@6.3.1` | pnpm сам выбрал соседние версии с provenance |
| peer-зависимости | ESLint 10 не поддерживают плагины `eslint-config-next` | ESLint 9.39.5 (помечен deprecated как прошлая мажорная ветка; уязвимостей нет) |
| `pnpm dlx` + `minimumReleaseAge` | `shadcn@4.23.0` собрал несовместимый набор (`@modelcontextprotocol/server` без `core`) | `shadcn init` через закэшированный `npx shadcn@4.23.0`; зависимости проекта всё равно ставит pnpm с проверками |
| Docker Hub | недоступен с машины разработчика (TLS timeout) | Зеркало `mirror.gcr.io` в настройках Docker Desktop (с разрешения человека) |
| `trustPolicy` (T02, 06.11) | `prisma@7.10.1` CLI — опубликован токеном `prismabot` без provenance, у 7.9.0 и 8.0-rc — GitHub Actions + SLSA. У пакета есть install-скрипт, и он в `allowBuilds` | Не ослабляли: весь набор Prisma 7.9.0 (решение человека) |
| Защита Prisma от ИИ-агентов (T02) | `prisma migrate reset` распознаёт запуск из Claude Code и требует явного согласия человека | Агент не сбрасывал базу: проверил «поднимается с нуля» на временной пустой базе (`createdb` → `db:deploy` → `db:seed` → `dropdb`). `pnpm db:reset` человек запускает сам |

---

## ⚠️ Условно (не включено по умолчанию; включаем на конкретном этапе)

| Инструмент | Почему условно | Как использовать безопасно |
|---|---|---|
| **chrome-devtools-mcp** (Google, Apache-2.0, 1.12.0, аудит чистый) | Телеметрия включена по умолчанию. CrUX отправляет URL в Google. Есть доступ к cookie и вкладкам браузера | Только на T13 для трейсов производительности и Lighthouse: `claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@1.12.0 --isolated --headless --no-usage-statistics --no-performance-crux`. Убрать после этапа**Итог T13 (09–10.11):** подключён `-s local`, в сессии не появился — использовали его командную строку с теми же флагами. Chromium от Playwright (`chromium-1248`, 437 МБ) Windows не запускает (`Permission denied`, похоже Smart App Control) — защиту ОС не обходили, работали на `chrome-headless-shell`. `lighthouse_audit` **не считает Performance** (категории зашиты, во встроенном Lighthouse из метрик только CLS) — для порога T13 не годится. MCP удалён 10.11 (`claude mcp remove chrome-devtools -s local`); кэш `npx` и `chromium-1248` удаляет человек |
| **lighthouse@13.6.0** (Google, Apache-2.0, provenance SLSA, релиз 27.10, `npm audit` 0 на 138 зависимостей, без install-скриптов) | Не зависимость проекта; 181 МБ | T13: поставлен **вне проекта** во временную папку агента, Node API + puppeteer-core на `chrome-headless-shell`, `enableErrorReporting: false`. Замеры 09.11 и 10.11 (после Б′) — `docs/process/lighthouse-T13.md`. Папку удалить после замера прода в Б′ |
| **Context7** (Upstash, MIT) | В марте 2026 раскрыта уязвимость ContextCrush: «AI-инструкции» от авторов библиотек без фильтрации уходили агенту, PoC крал `.env`. Исправлено 23.02.2026, но канал остался: в контекст агента попадает текст третьих лиц | Для Next не нужен (есть локальная документация). Для Prisma 7 и Tailwind 4 — только если агент буксует, на одну сессию, при включённых запретах чтения `.env`. Предпочитай официальную документацию через WebFetch |
| **claude-code-security-review** (GitHub Action, Anthropic, MIT) | Нужен платный ключ API. README прямо пишет: **не защищён от prompt injection**, только для доверенных PR | Только если будет ключ API и только на наши PR. Без него хватает `/security-review` и плагина claude-security локально |
| **Adobe for creativity MCP** (коннектор claude.ai, Adobe) — `font_recommend`, `suggest_type_palettes` | Внешний сервис: запрос уходит в Adobe. Шрифты Adobe Fonts нельзя хостить у себя (лицензия), а ТЗ требует разрешающую лицензию. Проверено на T04 06.11: на запрос «кириллица, деканат, документы» советует самые распространённые шрифты (Roboto, Open Sans, Fira Sans, Source Sans 3) — для снижения шаблонности почти бесполезен | Только для подсказок по шрифтам и палитрам, с явного разрешения человека (дано 06.11). Отправлять только описание задачи — без кода, данных, ключей. В проект — только шрифты под OFL с Google Fonts через `next/font` |
| **Скилл `design:design-critique`** (плагин design, claude.ai) | Только инструкции (markdown), сети и кода нет | Структура разбора макетов: впечатление, удобство, иерархия, цельность, доступность. Использован на T04 06.11 для сравнения вариантов палитры |
| **Скилл `frontend-design`** (`claude-plugins-official`, уже одобрен выше) | В сессиях worktree не подгружается как скилл | Читать `SKILL.md` напрямую из кэша плагинов: `~/.claude/plugins/cache/claude-plugins-official/frontend-design/*/skills/frontend-design/SKILL.md` |
| **Antigravity CLI `agy`** (Google LLC; проприетарный, исходников нет, условия — antigravity.google/terms. Проверено 07.11: `agy.exe` подписан Google LLC (DigiCert), подпись валидна; 07.11 обновлён 1.5.0 → **1.5.2** (подпись снова проверена, старые версии удалены), CLI обновляет себя сам) | Код и промпты уходят в Google. На личном аккаунте разговоры хранятся, идут на улучшение продуктов и доступны сотрудникам и подрядчикам Google (terms, п. 3 и 5). Отключается только переключателем Enable Telemetry в `/config`: он хранится в аккаунте, а не в settings.json. Инцидент 11.2025 (PromptArmor): prompt injection заставил агента прочитать `.env` и отправить его через браузерного субагента. Google отнёс это к known issues (источники вторичные: simonwillison.net, bdtechtalks.com; страница bughunters не открылась). Песочница на Windows — AppContainer, нужна Win 11 24H2+ (у нас 25H2) | Разрешён человеком 06.11 **только для простых задач без секретов**. (1) Запуск только `agy -p "…" --sandbox` из пустой папки в scratchpad: без `--add-dir` проекта и без `--dangerously-skip-permissions`; нужный фрагмент кода передаётся в тексте промпта. (2) Никогда не передавать `.env`, `SEED_PASSWORD_*`, `.claude/` и `.mcp.json`. (3) Не запускать `agy plugin import claude`, `remote-control`, `--remote-agent`. (4) Ответ — черновик: Claude перепроверяет его и вносит в проект сам. (5) Версия ≥ 1.5.2: там исправлена загрузка плагинов из чужих репозиториев. (6) Каждая передача задачи в agy — строка в журнал. **Сделано 07.11 (с разрешения человека):** в `~/.gemini/antigravity-cli/settings.json` → `permissions.deny` добавлены `read_file(…\protokol)` и `write_file(…\protokol)`. Проверено файлом-приманкой вне секретов: `read_file` отклонён с ответом «Matches user-configured deny rule»; команды терминала в `-p` без allow-правил отклоняются автоматически. Enable Telemetry в `/config` — off (проверил человек 07.11; настройка хранится в аккаунте, без интерфейса не переключается) |
| **Песочница Claude Code** (`sandbox.enabled`) | На нативном Windows не работает, только macOS, Linux и WSL2 | Рекомендация: разрабатывать в **WSL2**. Там же лучше работают Docker, pnpm и Prisma. В WSL2 добавь в `.claude/settings.local.json`: `{"sandbox": {"enabled": true}}` |

---

### Озвучка видео для жюри (T14, 12.11)
| Инструмент | Проверка | Как используем |
|---|---|---|
| **Chatterbox Multilingual** — пакет `chatterbox-tts==0.1.7` (Resemble AI, MIT, релиз 26.03.2026; модель `ResembleAI/chatterbox` на Hugging Face, MIT, 23 языка с русским) | Издатель — Resemble AI (`engineering@resemble.ai`, `github.com/resemble-ai/chatterbox`). При первом запуске качает веса с Hugging Face. В звук встраивается неслышимый водяной знак «сгенерировано ИИ» (`resemble-perth`) — честно, не скрываем. Пакет требует `torch==2.6.0`, а RTX 5070 Ti (Blackwell) работает только с PyTorch ≥ 2.7 на CUDA 12.8 → поставлен `torch/torchaudio 2.8.0+cu128`, пакет — `--no-deps`, зависимости — вручную по его же версиям, без `gradio` (демо-интерфейс). `spacy_pkuseg` (китайская разбивка, качает словарь с GitHub при загрузке) отключён в скрипте — Chatterbox штатно пропускает китайский | **Не зависимость проекта**: отдельное окружение Python 3.10 в `C:\Users\ivanl\tools\tts` (venv + кэш моделей, ~11 ГБ; удаление — стереть папку). Работает **локально на видеокарте**, текст сценария никуда не уходит. Голос — демо-образец самой Resemble AI (`ru_m.flac`), не голос известного человека. **Отклонены:** английский Space Chatterbox (образец по умолчанию похож на голос актрисы из игры), Spaces «russian-tts» анонимных авторов, онлайн-Spaces Resemble AI (бесплатный GPU Hugging Face отклоняет анонимные запросы). Решение человека 12.11: «локально, можно на видеокарте» |
| **faster-whisper 1.2.1** (SYSTRAN, MIT, релиз 31.10.2025; модель `medium`, ~1,5 ГБ) | Издатель — SYSTRAN (`github.com/SYSTRAN/faster-whisper`). Зависимости — `ctranslate2`, `onnxruntime`, `av`, `tokenizers`. Работает на видеокарте (cuDNN и cuBLAS — из PyTorch) | Только проверка озвучки: распознаёт каждый дубль и выбирает совпавший с текстом. Там же, в `C:/Users/ivanl/tools/tts` (удаление — та же папка), локально, ничего не отправляет. Решение человека 12.11 |

## ❌ Отклонено

| Инструмент | Причина |
|---|---|
| **next-devtools-mcp** (Vercel) | Последний релиз 0.4.0 от 24.06.2026 (не обновляется больше 4 месяцев). Тянет уязвимые `@modelcontextprotocol/sdk` (утечка данных между клиентами, отправка OAuth-учётных данных) и `zod` (исчерпание памяти), исправления нет. Телеметрия включена по умолчанию. Пользу (документация по версии) даёт `node_modules/next/dist/docs/` |
| **Плагин и MCP Prisma** | Удалённый сервер с аккаунтом Prisma Postgres. Есть разрушительные инструменты (`migrate-reset --force`, удаление БД). Нам хватает CLI, а `migrate reset` закрыт хуком и правилом «спросить» |
| **Плагин Semgrep (Guardian)** | Закрытый бинарник, скачивается с semgrep.dev, нужен вход в аккаунт, телеметрия. Заменён OSS-CLI в CI |
| **Плагин Vercel / скилл deploy-to-vercel** | Хостим на российском VPS, а не на Vercel |
| **@lhci/cli** (Lighthouse CI) | 12 high-находок в транзитивных зависимостях (цепочка puppeteer → proxy-agent → basic-ftp). На T13 вместо него — полный `lighthouse@13.6.0` вне проекта (см. «Условно»): `lighthouse_audit` из chrome-devtools-mcp Performance не считает |
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
