// Тест-страж доступа (CLAUDE.md → «Железные правила», docs/05-security.md → S1).
// Разбирает исходники AST-деревом TypeScript (а не regex — комментарий или строка «requireStudent» не обманут):
//  - каждая page.tsx в (student) вызывает requireStudent(), в (staff) — requireStaff();
//  - каждая экспортируемая функция в файлах "use server" вызывает guard — или стоит в списке исключений с причиной;
//  - каждый route handler в app/api — то же;
//  - layout.tsx guard НЕ вызывает (проверка в layout не защищает, а создаёт ложное чувство защиты).
// Тест пишется от угрозы: в конце проверяем, что он ловит подложенные «плохие» файлы.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const SRC = join(ROOT, "src");
const APP = join(SRC, "app");
const GUARDS = ["requireUser", "requireStudent", "requireStaff"] as const;

/** Server Actions без guard — осознанно. Ключ: «путь от src/:имя». */
const ACTION_EXCEPTIONS: Record<string, string> = {
  "server/actions/auth.ts:login": "вход: сессии ещё нет",
  "server/actions/auth.ts:demoLogin":
    "демо-вход: сессии ещё нет, проверяет DEMO_MODE и список логинов",
  "server/actions/auth.ts:logout": "выход без сессии безвреден — просто удаляет cookie",
};

/** Route handlers без guard. */
const ROUTE_EXCEPTIONS: Record<string, string> = {
  "app/api/health/route.ts:GET":
    "проверка БД для Docker healthcheck, данных пользователей не трогает",
};

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === "generated" ? [] : walk(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

const rel = (p: string) => relative(SRC, p).split(sep).join("/");

function parse(file: string, text = readFileSync(file, "utf8")) {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/** Вызывает ли узел (тело функции) один из guards — напрямую, `await guard()`. */
function callsGuard(node: ts.Node, names: readonly string[]): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      names.includes(n.expression.text)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function hasUseServer(sf: ts.SourceFile): boolean {
  const first = sf.statements[0];
  return (
    !!first &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === "use server"
  );
}

const isExported = (n: ts.Node) =>
  ts.canHaveModifiers(n) &&
  (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

/** Экспортируемые функции файла: `export (async) function f` и `export const f = async () => …`. */
function exportedFunctions(sf: ts.SourceFile): { name: string; body: ts.Node }[] {
  const out: { name: string; body: ts.Node }[] = [];
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && isExported(st) && st.name && st.body) {
      out.push({ name: st.name.text, body: st.body });
    }
    if (ts.isVariableStatement(st) && isExported(st)) {
      for (const d of st.declarationList.declarations) {
        if (
          ts.isIdentifier(d.name) &&
          d.initializer &&
          (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))
        ) {
          out.push({ name: d.name.text, body: d.initializer.body });
        }
      }
    }
  }
  return out;
}

/** Тело default-экспорта page.tsx. */
function defaultExportBody(sf: ts.SourceFile): ts.Node | null {
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.body) {
      const mods = ts.getModifiers(st) ?? [];
      if (
        mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
        mods.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
      ) {
        return st.body;
      }
    }
  }
  return null;
}

// ── Проверки как чистые функции: их же гоняем на подложенных файлах ───────────

function pageViolation(file: string, text: string, guard: string): string | null {
  const body = defaultExportBody(parse(file, text));
  if (!body) return `${file}: нет export default function`;
  return callsGuard(body, [guard]) ? null : `${file}: page не вызывает ${guard}()`;
}

function actionViolations(
  file: string,
  text: string,
  exceptions: Record<string, string>,
): string[] {
  const sf = parse(file, text);
  if (!hasUseServer(sf)) return [];
  return exportedFunctions(sf)
    .filter((f) => !exceptions[`${file}:${f.name}`] && !callsGuard(f.body, GUARDS))
    .map((f) => `${file}: Server Action ${f.name}() без guard`);
}

const HTTP = ["GET", "POST", "PUT", "PATCH", "DELETE"];
function routeViolations(file: string, text: string, exceptions: Record<string, string>): string[] {
  return exportedFunctions(parse(file, text))
    .filter((f) => HTTP.includes(f.name))
    .filter((f) => !exceptions[`${file}:${f.name}`] && !callsGuard(f.body, GUARDS))
    .map((f) => `${file}: ${f.name} без guard`);
}

function layoutViolation(file: string, text: string): string | null {
  return callsGuard(parse(file, text), GUARDS)
    ? `${file}: layout вызывает guard — проверка должна быть в каждой page`
    : null;
}

// ── Реальные файлы ───────────────────────────────────────────────────────────

const allFiles = walk(SRC);
const read = (f: string) => readFileSync(f, "utf8");

describe("тест-страж: guard в каждой page, Server Action и route handler", () => {
  const pages = allFiles.filter((f) => f.endsWith(`${sep}page.tsx`));
  const studentPages = pages.filter((f) => rel(f).startsWith("app/(student)/"));
  const staffPages = pages.filter((f) => rel(f).startsWith("app/(staff)/"));

  it("страницы найдены (иначе тест ничего не проверяет)", () => {
    expect(studentPages.length).toBeGreaterThanOrEqual(8);
    expect(staffPages.length).toBeGreaterThanOrEqual(1);
  });

  it.each(studentPages.map((f) => [rel(f), f]))("%s вызывает requireStudent()", (_, f) => {
    expect(pageViolation(rel(f), read(f), "requireStudent")).toBeNull();
  });

  it.each(staffPages.map((f) => [rel(f), f]))("%s вызывает requireStaff()", (_, f) => {
    expect(pageViolation(rel(f), read(f), "requireStaff")).toBeNull();
  });

  it('каждая экспортируемая функция в "use server" вызывает guard или в списке исключений', () => {
    const files = allFiles.filter((f) => hasUseServer(parse(f)));
    expect(files.length).toBeGreaterThan(0);
    expect(files.flatMap((f) => actionViolations(rel(f), read(f), ACTION_EXCEPTIONS))).toEqual([]);
  });

  it("исключения не устарели: каждая функция из списка существует", () => {
    for (const key of [...Object.keys(ACTION_EXCEPTIONS), ...Object.keys(ROUTE_EXCEPTIONS)]) {
      const [file, name] = key.split(":");
      const fns = exportedFunctions(parse(join(SRC, file!))).map((f) => f.name);
      expect(fns, key).toContain(name);
    }
  });

  it("route handlers в app/api вызывают guard или в списке исключений", () => {
    const routes = allFiles.filter((f) => rel(f).startsWith("app/api/") && f.endsWith("route.ts"));
    expect(routes.flatMap((f) => routeViolations(rel(f), read(f), ROUTE_EXCEPTIONS))).toEqual([]);
  });

  it("layout.tsx в (student) и (staff) не вызывают guard", () => {
    const layouts = allFiles.filter(
      (f) => f.endsWith(`${sep}layout.tsx`) && /^app\/\((student|staff)\)\//.test(rel(f)),
    );
    expect(layouts.length).toBeGreaterThanOrEqual(2);
    expect(layouts.map((f) => layoutViolation(rel(f), read(f))).filter(Boolean)).toEqual([]);
  });

  it("app/ не лежит вне src (иначе страж смотрел бы не туда)", () => {
    expect(allFiles.some((f) => f.startsWith(APP))).toBe(true);
  });
});

describe("тест-страж ловит нарушения (проверка самого стража)", () => {
  it("page без guard", () => {
    const text = `export default async function Page() { return <div /> }`;
    expect(pageViolation("app/(student)/x/page.tsx", text, "requireStudent")).not.toBeNull();
  });

  it("guard только в комментарии или строке — не считается", () => {
    const text = `// requireStudent()
      export default async function Page() { const s = "requireStudent()"; return <div>{s}</div> }`;
    expect(pageViolation("app/(student)/x/page.tsx", text, "requireStudent")).not.toBeNull();
  });

  it("не тот guard: requireStaff на странице студента", () => {
    const text = `export default async function Page() { await requireStaff(); return null }`;
    expect(pageViolation("app/(student)/x/page.tsx", text, "requireStudent")).not.toBeNull();
  });

  it("guard в page — ок", () => {
    const text = `export default async function Page() { const ctx = await requireStudent(); return null }`;
    expect(pageViolation("app/(student)/x/page.tsx", text, "requireStudent")).toBeNull();
  });

  it("Server Action без guard — и function, и стрелка", () => {
    const text = `"use server";
      export async function cancelRequest(fd: FormData) { await repo.cancel(fd.get("id")) }
      export const reopen = async () => { await repo.reopen() };
      export async function ok() { const ctx = await requireStudent(); }`;
    expect(actionViolations("server/actions/x.ts", text, {})).toEqual([
      "server/actions/x.ts: Server Action cancelRequest() без guard",
      "server/actions/x.ts: Server Action reopen() без guard",
    ]);
  });

  it("route handler без guard", () => {
    const text = `export async function GET() { return Response.json(await repo.all()) }`;
    expect(routeViolations("app/api/x/route.ts", text, {})).toHaveLength(1);
  });

  it("layout с guard", () => {
    const text = `export default async function L({ children }) { await requireStudent(); return children }`;
    expect(layoutViolation("app/(student)/layout.tsx", text)).not.toBeNull();
  });
});
