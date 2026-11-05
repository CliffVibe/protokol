// Запуск: node --test .claude/hooks/guard.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const guard = fileURLToPath(new URL("./guard.mjs", import.meta.url));
const run = (tool_name, tool_input) =>
  spawnSync(process.execPath, [guard], { input: JSON.stringify({ tool_name, tool_input }), encoding: "utf8" }).status;

const cases = [
  ["секрет с NEXT_PUBLIC_", "Write", { file_path: "/p/src/lib/x.ts", content: "process.env.NEXT_PUBLIC_GIGACHAT_KEY" }, 2],
  ["публичный URL можно", "Write", { file_path: "/p/src/lib/x.ts", content: "process.env.NEXT_PUBLIC_APP_URL" }, 0],
  ["правка .env.local", "Edit", { file_path: "C:\\p\\.env.local", new_string: "A=1" }, 2],
  ["правка .env.example можно", "Edit", { file_path: "/p/.env.example", new_string: "A=" }, 0],
  ["prisma в странице", "Write", { file_path: "/p/src/app/(student)/page.tsx", content: 'import { db } from "@/server/db"' }, 2],
  ["prisma в репозитории можно", "Write", { file_path: "/p/src/server/repos/schedule.ts", content: 'import { db } from "@/server/db"' }, 0],
  ["пароль в сиде", "Write", { file_path: "/p/prisma/seed.ts", content: 'password: "alisa123"' }, 2],
  ["пароль из env можно", "Write", { file_path: "/p/prisma/seed.ts", content: "password: process.env.SEED_PASSWORD_ALISA" }, 0],
  ["cat .env.local", "Bash", { command: "cat .env.local" }, 2],
  ["cat .env.example можно", "Bash", { command: "cat .env.example" }, 0],
  ["обход minimumReleaseAge", "Bash", { command: "pnpm add foo --ignore-min-release-age" }, 2],
  ["обычная команда", "Bash", { command: "pnpm test" }, 0],
];
for (const [name, tool, input, expected] of cases) test(name, () => assert.equal(run(tool, input), expected));
