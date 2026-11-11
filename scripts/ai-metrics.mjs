// Метрики ИИ-процесса для отчёта жюри (T14): только чтение репозитория — git и docs/, без сети.
// node scripts/ai-metrics.mjs            → таблица в консоль
// node scripts/ai-metrics.mjs --json     → JSON (для сборки отчёта)
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const root = process.cwd();
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const read = (p) => readFileSync(join(root, p), "utf8");

function walk(dir, filter) {
  const out = [];
  if (!existsSync(join(root, dir))) return out;
  for (const name of readdirSync(join(root, dir))) {
    const rel = join(dir, name);
    const st = statSync(join(root, rel));
    if (st.isDirectory()) out.push(...walk(rel, filter));
    else if (filter(rel)) out.push(rel);
  }
  return out;
}
const count = (text, re) => (text.match(re) ?? []).length;

// ── Git ──────────────────────────────────────────────────────────────────
// Разделитель записей — символ, которого нет в сообщениях коммитов
const SEP = "\u001e";
const log = git("log", `--format=%H%x1f%ad%x1f%s%x1f%b${SEP}`, "--date=short")
  .split(SEP)
  .map((r) => r.trim())
  .filter(Boolean)
  .map((r) => {
    const [hash, date, subject, body] = r.split("\u001f");
    return { hash, date, subject, body: body ?? "" };
  });
const coAuthored = log.filter((c) => /Co-Authored-By: Claude/i.test(c.body));
const dates = log.map((c) => c.date).sort();
const byType = {};
for (const c of log) {
  const type = /^(\w+)(\(|:)/.exec(c.subject)?.[1] ?? "other";
  byType[type] = (byType[type] ?? 0) + 1;
}

// ── Тесты (статический подсчёт объявлений test()/it(); e2e идут в двух проектах: десктоп и 360px) ──
const testFiles = (dir) => walk(dir, (p) => /\.(test|spec)\.(ts|tsx|mts|mjs)$/.test(p));
const testCount = (files) =>
  files.reduce((n, f) => n + count(read(f), /^\s*(test|it)(\.(skip|fixme))?\(/gm), 0);
const unit = testFiles("tests/unit");
const integration = testFiles("tests/integration");
const e2e = testFiles("tests/e2e");
// Тесты хука — таблица случаев ([имя, инструмент, ввод, ожидание]), а не отдельные test()
const guardTests = existsSync(join(root, ".claude/hooks/guard.test.mjs"))
  ? count(read(".claude/hooks/guard.test.mjs"), /^\s*\[\s*"/gm)
  : 0;

// ── Код ──────────────────────────────────────────────────────────────────
// Без src/generated — клиент Prisma генерируется, его не писали ни человек, ни ИИ
const srcFiles = walk(
  "src",
  (p) => [".ts", ".tsx"].includes(extname(p)) && !/[\\/]generated[\\/]/.test(p),
);
const srcLines = srcFiles.reduce((n, f) => n + read(f).split("\n").length, 0);

// ── Процесс: ошибки ИИ, журнал, документы для агентов ────────────────────
const aiErrors = read("docs/process/ai-errors.md")
  .split("\n")
  .filter((l) => /^\| \d\d\.\d\d/.test(l));
// Кто поймал ошибку — по 4-й колонке («Как заметили»). Одна ошибка может попасть в несколько групп.
const DETECTORS = [
  ["человек", /человек/i],
  ["тесты (unit, e2e, CI)", /тест|e2e|vitest|ci\b|ci |playwright|gitleaks|сборк/i],
  ["субагенты и ревью", /ревьюер|reviewer|ревью|mobile-qa|субагент|security-guidance|panel/i],
  ["хук-охранник", /хук|guard/i],
  ["ИИ сам", /ии сам|сам[,. ]|сама|заметил сам|на своём скриншоте/i],
];
const caughtBy = Object.fromEntries(DETECTORS.map(([k]) => [k, 0]));
for (const row of aiErrors) {
  const how = row.split("|")[4] ?? "";
  for (const [k, re] of DETECTORS) if (re.test(how)) caughtBy[k]++;
}
const journal = read("docs/process/journal.md");
// Только записи с датой: шаблон «### ДД.ММ — …» в начале журнала не считаем
const journalEntries = count(journal, /^### \d/gm);
const manualMarks = count(journal, /\*\*Вручную/g);

const docsForAgents = {
  "CLAUDE.md, строк": read("CLAUDE.md").split("\n").length,
  "документов в docs/": walk("docs", (p) => p.endsWith(".md") && !p.includes("process")).length,
  "задач в docs/tasks/": walk("docs/tasks", (p) => /T\d\d/.test(p)).length,
  "субагентов (.claude/agents)": walk(".claude/agents", (p) => p.endsWith(".md")).length,
  "команд (.claude/commands)": walk(".claude/commands", (p) => p.endsWith(".md")).length,
  "хуков (.claude/hooks)": walk(".claude/hooks", (p) => /\.mjs$/.test(p) && !/test/.test(p)).length,
};
const screenshots = walk("docs/process/screenshots", (p) => p.endsWith(".png")).length;

const metrics = {
  git: {
    commits: log.length,
    coAuthoredByClaude: coAuthored.length,
    from: dates[0],
    to: dates[dates.length - 1],
    byType,
  },
  tests: {
    unit: testCount(unit),
    integration: testCount(integration),
    e2e: testCount(e2e),
    e2eFiles: e2e.length,
    guardHook: guardTests,
  },
  code: { srcFiles: srcFiles.length, srcLines },
  process: {
    aiErrors: aiErrors.length,
    caughtBy,
    journalEntries,
    manualMarks,
    screenshots,
    docsForAgents,
  },
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(metrics, null, 2));
} else {
  const m = metrics;
  console.log(
    `Коммиты: ${m.git.commits} (${m.git.from} — ${m.git.to}), из них с соавторством Claude: ${m.git.coAuthoredByClaude}`,
  );
  console.log(
    `  по типам: ${Object.entries(m.git.byType)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ")}`,
  );
  console.log(
    `Тесты (объявления): unit ${m.tests.unit}, интеграция ${m.tests.integration}, e2e ${m.tests.e2e} в ${m.tests.e2eFiles} файлах (×2 проекта), хук ${m.tests.guardHook}`,
  );
  console.log(`Код: ${m.code.srcFiles} файлов в src/, ${m.code.srcLines} строк`);
  console.log(
    `Ошибки ИИ: ${m.process.aiErrors}; поймали: ${Object.entries(m.process.caughtBy)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ")}`,
  );
  console.log(
    `Журнал: ${m.process.journalEntries} записей, отметок «вручную»: ${m.process.manualMarks}; скриншотов: ${m.process.screenshots}`,
  );
  console.log(
    `Для агентов: ${Object.entries(m.process.docsForAgents)
      .map(([k, v]) => `${k} ${v}`)
      .join("; ")}`,
  );
}
