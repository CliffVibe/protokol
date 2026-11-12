# VPS для «Протокола» — чек-лист (подготовлено 09.11, T13)

Цель: человеку остаётся войти в аккаунт, оплатить и вставить пару строк; остальное делает скрипт `deploy/setup-vps.sh`.
Сам агент по SSH не ходит и ничего не оплачивает (`/deploy`, правила безопасности).

## 0. До заказа: репозиторий на GitHub (обязательно)
На 09.11 у локального репозитория **нет удалённого адреса**: `git remote -v` пуст. А прод-образ `ghcr.io/cliffvibe/protokol` собирает CI GitHub (`.github/workflows/image.yml`) после пуша — без репозитория VPS нечего скачивать. Кроме того, ТЗ требует ссылку на репозиторий с доступом для жюри.
1. Создать репозиторий `protokol` на GitHub (аккаунт `cliffvibe`, если образ должен называться как в `docker-compose.prod.yml`). Видимость — решение человека: публичный проще (жюри и VPS без токенов), приватный — нужно приглашать жюри и логинить VPS в GHCR токеном с `read:packages`.
2. По «да» человека агент добавит `origin` и запушит `main` (пуш — только с отдельного «да»).
3. Дождаться зелёных `CI` и `image` в Actions. Если репозиторий приватный — пакет в GHCR сделать публичным или выпустить токен только на чтение пакетов.

## 1. Заказ (сделан 09.11): FirstVDS «Разгон»
Выбор человека 09.11 после сравнения цен: **FirstVDS «Разгон»** — Москва, 2 ядра / 4 ГБ RAM / 60 ГБ NVMe, Ubuntu 24.04, 1 IPv4 включён, без ispmanager (стоял по умолчанию: месяц бесплатно, дальше 399 ₽) и без бэкапов — **1 069 ₽/мес, списание посуточно** (≈ 36 ₽/день; удалили сервер — списания прекратились). Корзину собрал агент через Claude in Chrome (Brave), регистрацию и оплату сделал человек.
Сравнение 09.11: Timeweb Cloud Ultra Москва 2/4/40 — 5 400 ₽ (Premium в Москве и СПб — только предзаказ), Timeweb Premium Новосибирск 1/2/30 — 2 140 ₽ (требует баланс на месяц вперёд); Beget — кибератака 1–2.11, восстановление ещё шло. Публичных промокодов FirstVDS на ноябрь нет (акции 2026 завершены).
Поля cloud-init у FirstVDS нет — скрипт запускается по SSH (шаг 2б).

## 2. После покупки
а) Если скрипт был в cloud-init — через 3–5 минут на сервере появится `/root/protokol-setup.done`.
б) Если нет — с компьютера человека:
```bash
scp deploy/setup-vps.sh root@<IP>:
```
```bash
ssh root@<IP> "sh setup-vps.sh"
```
в) Прислать агенту **только IP** (не пароли). Домен на старте — `<IP-через-дефисы>.sslip.io`.

## 3. Код и секреты — только руками человека, на сервере
Репозиторий публичный с 09.11 (https://github.com/CliffVibe/protokol); образы `ghcr.io/cliffvibe/protokol:latest` и `:tools` скачиваются без логина (проверено).
```bash
ssh root@<IP>
```
```bash
git clone --depth 1 https://github.com/CliffVibe/protokol.git /opt/protokol && cd /opt/protokol && cp .env.example .env && openssl rand -hex 24
```
Последняя команда печатает случайную строку для `POSTGRES_PASSWORD` (hex — без `@ : /`, которые ломают адрес базы). Затем `nano .env`:
- `DOMAIN=<IP-через-дефисы>.sslip.io`, `APP_URL=https://<тот же домен>`;
- `POSTGRES_PASSWORD=<строка из openssl>`;
- `SEED_PASSWORD_ALISA/TIMUR/VERA/IRINA` — пароли жюри, **не короче 12 символов** (иначе сид на проде откажется);
- `DEMO_MODE=1`; `GIGACHAT_AUTH_KEY` — по желанию;
- **строку `NODE_EXTRA_CA_CERTS=` удалить целиком**: пустое значение из `.env` перекрыло бы путь к сертификату, заданный в образе, и GigaChat не прошёл бы TLS;
- `DATABASE_URL` можно не трогать — compose собирает его сам из `POSTGRES_*`.
В чат и в терминал агента значения не вводить.

## 4. Первый запуск
```bash
cd /opt/protokol && docker compose -f docker-compose.prod.yml --profile tools pull && docker compose -f docker-compose.prod.yml run --rm tools pnpm db:deploy && docker compose -f docker-compose.prod.yml run --rm tools pnpm db:seed && docker compose -f docker-compose.prod.yml up -d
```
Проверка: `https://<DOMAIN>/login` открывается с плашкой концепта; `https://<DOMAIN>/api/health` снаружи — 404 (закрыт в Caddy, T13).

## Что делает `deploy/setup-vps.sh`
Часовой пояс МСК; Docker и Compose из архива Ubuntu (download.docker.com из РФ доступен не всегда); swap 2 ГБ; зеркало `mirror.gcr.io` для Docker Hub; ротация логов Docker; ufw — только 22, 80, 443; вход по SSH только по ключу (пароль выключается, лишь если ключ уже есть — чтобы не потерять доступ); fail2ban; клон репозитория в `/opt/protokol`; cron ночного пересева демо в 04:00 МСК (срабатывает, только когда есть `.env`). Секретов в скрипте нет.
