// Запуск прод-сборки так же, как в Docker-образе: .next/standalone/server.js + статика рядом.
// Используется e2e-тестами (playwright.config.ts → webServer), чтобы проверять ровно то, что поедет на прод.
import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const root = ".next/standalone";
if (!existsSync(`${root}/server.js`)) {
  console.error("Нет .next/standalone/server.js — сначала `pnpm build`.");
  process.exit(1);
}
cpSync("public", `${root}/public`, { recursive: true });
cpSync(".next/static", `${root}/.next/static`, { recursive: true });

const child = spawn(process.execPath, ["server.js"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    HOSTNAME: process.env.HOSTNAME ?? "127.0.0.1",
    // Как в Docker-образе (T12): корневой сертификат Минцифры для TLS GigaChat. Node читает переменную
    // только при старте процесса, поэтому задаём её дочернему server.js здесь. Проверка TLS остаётся.
    NODE_EXTRA_CA_CERTS:
      process.env.NODE_EXTRA_CA_CERTS || resolve("certs/russian_trusted_root_ca.pem"),
  },
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code) => process.exit(code ?? 0));
