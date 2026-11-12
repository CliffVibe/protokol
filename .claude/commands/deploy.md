---
description: Задеплоить текущую версию на VPS
---
1. Выполни `/check`. При любой красной проверке — остановись.
2. Убедись, что изменения закоммичены и запушены.
3. Подскажи человеку команды для сервера (сам по SSH не ходи, если человек явно не разрешил):
   `git pull && docker compose -f docker-compose.prod.yml --profile tools pull && docker compose -f docker-compose.prod.yml run --rm tools pnpm db:deploy && docker compose -f docker-compose.prod.yml up -d`
   (образы собирает CI → GHCR; миграции — через служебный образ `:tools`, в образе приложения Prisma CLI нет; см. `docs/03-architecture.md` → «Деплой»).
   **`--profile tools` обязателен:** сервис `tools` стоит под `profiles`, и обычный `pull` его пропускает — приложение обновится, а миграции останутся старыми (на проде 12.11 так упал кабинет сотрудника).
   После `db:deploy` проверить вывод: должны быть применены все миграции из `prisma/migrations`.
4. После деплоя: smoke-проверка `curl -I https://<домен>` и вход под тестовым аккаунтом через Playwright по прод-адресу.
5. Запись в журнал: версия, дата, результат.
