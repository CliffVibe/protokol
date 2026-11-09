#!/bin/sh
# Первичная настройка VPS для «Протокола» (Ubuntu 24.04, T13). Без секретов: .env человек пишет сам.
# Как запустить — любой из двух способов:
#   1) при заказе сервера вставить весь файл в поле cloud-init / «Пользовательские данные»
#      (cloud-init выполняет user-data, начинающиеся с #!, как скрипт от root при первом запуске);
#   2) после покупки: scp deploy/setup-vps.sh root@<IP>:  и  ssh root@<IP> 'sh setup-vps.sh'
# Повторный запуск безопасен: каждый шаг проверяет, не сделан ли он уже.
# Лог при cloud-init: /var/log/cloud-init-output.log; итог — /root/protokol-setup.done
# Первая строка — #!/bin/sh: форма Timeweb Cloud принимает только #!/bin/sh или #cloud-config.
# Дальше нужен bash (pipefail), поэтому под sh скрипт сразу перезапускает себя в bash.
if [ -z "${BASH_VERSION:-}" ]; then exec /bin/bash "$0" "$@"; fi
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
# git не спрашивает логин, если репозитория нет или он приватный: шаг 6 просто пропускается
export GIT_TERMINAL_PROMPT=0

# Репозиторий на GitHub (на 09.11 ещё не создан — docs/process/vps-setup.md, шаг 0). Нет доступа — шаг 6 пропустится
REPO_URL="${PROTOKOL_REPO_URL:-https://github.com/cliffvibe/protokol.git}"
APP_DIR="/opt/protokol"

echo "[protokol] 1/7 часовой пояс и пакеты"
timedatectl set-timezone Europe/Moscow || true
apt-get update -y
# Docker и Compose — из архива Ubuntu: зеркала Ubuntu доступны из РФ, download.docker.com — не всегда
apt-get install -y ca-certificates curl git ufw fail2ban unattended-upgrades docker.io docker-compose-v2

echo "[protokol] 2/7 swap 2 ГБ (next build на сервере не нужен; Postgres + Node + Caddy и ночной пересев — с запасом на 2 ГБ RAM)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "[protokol] 3/7 Docker: зеркало реестра (Docker Hub из РФ бывает недоступен), автозапуск"
mkdir -p /etc/docker
if [ ! -f /etc/docker/daemon.json ]; then
  cat > /etc/docker/daemon.json <<'JSON'
{
  "registry-mirrors": ["https://mirror.gcr.io"],
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
JSON
fi
systemctl enable --now docker
systemctl restart docker

echo "[protokol] 4/7 файрвол: только SSH, HTTP, HTTPS (порт приложения 3000 и Postgres наружу не открываем)"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
# Docker публикует порты в обход ufw — поэтому в docker-compose.prod.yml наружу открыт только Caddy (80/443)

echo "[protokol] 5/7 SSH: только по ключу, fail2ban"
if [ -s /root/.ssh/authorized_keys ]; then
  # Пароль выключаем, только если ключ уже есть — иначе можно потерять доступ к серверу
  cat > /etc/ssh/sshd_config.d/60-protokol.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
CONF
  systemctl reload ssh || systemctl reload sshd || true
else
  echo "[protokol] ВНИМАНИЕ: SSH-ключа у root нет — вход по паролю оставлен. Добавьте ключ и запустите скрипт ещё раз."
fi
systemctl enable --now fail2ban

echo "[protokol] 6/7 код (только compose, Caddyfile и скрипты — образы собирает CI в GHCR)"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone --depth 1 "$REPO_URL" "$APP_DIR" || echo "[protokol] репозиторий не склонирован (приватный?) — склонируйте вручную в $APP_DIR"
fi

echo "[protokol] 7/7 ночной пересев демо в 04:00 (часовой пояс системы — МСК, шаг 1; 06-seed-data) — запустится, когда появится .env"
cat > /etc/cron.d/protokol-reset-demo <<'CRON'
0 4 * * * root [ -f /opt/protokol/.env ] && cd /opt/protokol && docker compose -f docker-compose.prod.yml run --rm tools pnpm db:reset-demo >> /var/log/protokol-reset.log 2>&1
CRON
chmod 644 /etc/cron.d/protokol-reset-demo

date > /root/protokol-setup.done
echo "[protokol] готово. Дальше — docs/process/vps-setup.md, шаг «После покупки»."
