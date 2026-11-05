---
description: Задеплоить текущую версию на VPS
---
1. Выполни `/check`. При любой красной проверке — остановись.
2. Убедись, что изменения закоммичены и запушены.
3. Подскажи человеку команды для сервера (сам по SSH не ходи, если человек явно не разрешил):
   `git pull && docker compose -f docker-compose.prod.yml up -d --build && docker compose -f docker-compose.prod.yml exec app pnpm prisma migrate deploy`
4. После деплоя: smoke-проверка `curl -I https://<домен>` и вход под тестовым аккаунтом через Playwright по прод-адресу.
5. Запись в журнал: версия, дата, результат.
