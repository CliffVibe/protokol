// PostToolUse-хук: после правки файла — prettier + eslint --fix только для этого файла.
// Ошибки не блокируют работу: они выводятся Claude, чтобы он их исправил.
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

let input = {};
try { input = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { process.exit(0); }
const file = input.tool_input?.file_path;
if (!file || !existsSync(file) || !existsSync("node_modules/.bin")) process.exit(0);

const run = (args) => spawnSync("pnpm", ["exec", ...args], { encoding: "utf8", shell: process.platform === "win32" });
if (/\.(ts|tsx|js|jsx|mjs|css|json|md)$/.test(file)) run(["prettier", "--write", "--log-level", "warn", file]);
if (/\.(ts|tsx|js|jsx|mjs)$/.test(file)) {
  const r = run(["eslint", "--fix", file]);
  if (r.status !== 0) {
    process.stderr.write(`ESLint нашёл проблемы в ${file}:\n${(r.stdout || "") + (r.stderr || "")}`.slice(0, 4000));
    process.exit(2);
  }
}
process.exit(0);
