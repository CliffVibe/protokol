// Результаты прогона тестов для отчёта жюри (T14): docs/report/test-run.json.
// Раньше числа «755 проверок, 0 падений» вписывали в отчёт и в титры видео руками — и они разошлись
// (оценка «глазами жюри»). Теперь их записывает этот скрипт, а scripts/build-report.mjs подставляет в отчёт.
//
// node scripts/record-test-run.mjs        — Vitest (unit + интеграция на базе e2e) и Playwright (весь e2e)
// Нужны Docker с базой и .env (как для pnpm test:e2e). База protokol_e2e пересеивается — демо не трогается.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "protokol-tests-"));
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const run = (args, env = {}) =>
  spawnSync(pnpm, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...env },
  });

// База e2e — та же, что у Playwright: интеграционные тесты пересеивают её, демо остаётся нетронутым.
// Адрес считаем здесь же (Node 24 сам снимает типы с e2e-db.ts): через `tsx -e` в shell Windows
// кавычки ломались, переменная приходила пустой — и интеграционные тесты молча пропускались (12.11)
await import("dotenv/config");
const { e2eDatabaseUrl } = await import("../tests/e2e/e2e-db.ts");
const testDb = e2eDatabaseUrl();

const vitestFile = join(tmp, "vitest.json");
run(
  [
    "exec",
    "vitest",
    "run",
    "--reporter=default",
    "--reporter=json",
    `--outputFile.json=${vitestFile}`,
  ],
  {
    TEST_DATABASE_URL: testDb,
  },
);
const vitest = JSON.parse(readFileSync(vitestFile, "utf8"));

const e2eFile = join(tmp, "e2e.json");
run(["exec", "playwright", "test", "--reporter=list,json"], {
  PLAYWRIGHT_JSON_OUTPUT_NAME: e2eFile,
});
const e2e = JSON.parse(readFileSync(e2eFile, "utf8")).stats;

// Интеграционные тесты не должны молча пропускаться: тогда цифра в отчёте была бы неправдой
if (vitest.numPendingTests > 0) {
  console.error(
    `Vitest пропустил ${vitest.numPendingTests} тестов — нет базы e2e? Отчёт не обновлён.`,
  );
  process.exit(1);
}

const result = {
  date: new Date().toISOString(),
  vitest: {
    passed: vitest.numPassedTests,
    failed: vitest.numFailedTests,
    skipped: vitest.numPendingTests + (vitest.numTodoTests ?? 0),
  },
  e2e: {
    passed: e2e.expected,
    failed: e2e.unexpected,
    flaky: e2e.flaky,
    skipped: e2e.skipped,
  },
};
writeFileSync("docs/report/test-run.json", `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (result.vitest.failed || result.e2e.failed) process.exitCode = 1;
