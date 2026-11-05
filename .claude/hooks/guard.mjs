// PreToolUse-хук: блокирует действия, нарушающие docs/05-security.md.
// Exit 2 = действие отменено, текст stderr уходит Claude как объяснение.
// Без зависимостей и сети — только stdin → проверки → exit code.
import { readFileSync } from "node:fs";

let input = {};
try { input = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { process.exit(0); }
const tool = input.tool_name ?? "";
const ti = input.tool_input ?? {};
const block = (msg) => { process.stderr.write(`[guard] ${msg}\nСм. docs/05-security.md\n`); process.exit(2); };

const path = String(ti.file_path ?? "").replaceAll("\\", "/");
const text = [ti.content, ti.new_string, ...(ti.edits ?? []).map((e) => e.new_string)].filter(Boolean).join("\n");
const cmd = String(ti.command ?? "");

if (tool !== "Bash") {
  // S4: секреты не попадают в клиентский бандл
  if (/NEXT_PUBLIC_[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD|AUTH)/i.test(text))
    block("Нельзя заводить секрет с префиксом NEXT_PUBLIC_ — он окажется в браузере.");
  // S4: реальные .env не редактируем (кроме .env.example)
  if (/(^|\/)\.env(\.[^/]*)?$/.test(path) && !path.endsWith(".env.example"))
    block("Файлы .env редактирует только человек. Добавь переменную в .env.example и попроси человека.");
  // S2: никаких захардкоженных паролей в сиде
  if (/prisma\/seed/.test(path) && /password\s*[:=]\s*["'][^"'$]{4,}["']/i.test(text))
    block("Пароли тестовых аккаунтов берутся из process.env (SEED_PASSWORD_*), не из кода.");
  // S1: prisma только в src/server/repos
  // Статический `from "…server/db"` и динамический `import("…server/db")`, с алиасом @/ или относительным путём
  // (включая `../db` из соседней папки src/server/*)
  const dbImport = /(?:\bfrom\s*|\bimport\s*\(\s*)["'](?:@\/|(?:\.\.?\/)+(?:src\/)?|src\/)?(?:server\/)?db(?:\.ts)?["']/;
  if (/^.*\/src\/(?!server\/repos\/|server\/db\.ts)/.test(path) && dbImport.test(text))
    block("Импорт @/server/db разрешён только в src/server/repos/**. Добавь функцию в репозиторий с ctx.");
  // S5
  if (/dangerouslySetInnerHTML/.test(text) && !/sanitize/i.test(text))
    block("dangerouslySetInnerHTML без санитайзера запрещён.");
  // Защищённый документ
  if (path.endsWith("docs/05-security.md"))
    block("docs/05-security.md меняется только по явной просьбе человека. Спроси его.");
} else {
  if (/prisma\s+migrate\s+reset/.test(cmd) && !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "localhost"))
    block("migrate reset разрешён только для локальной БД.");
  if (/--ignore-min-release-age|--no-verify\b/.test(cmd))
    block("Обход защит (minimumReleaseAge / git hooks) запрещён.");
  if (/\b(cat|type|more|less|head|tail|grep|rg)\b[^|;&]*\.env(?!\.example)\b/.test(cmd))
    block("Чтение .env через shell запрещено. Нужна переменная — спроси человека или смотри .env.example.");
}
process.exit(0);
