// Тест-страж доступа (CLAUDE.md → «Железные правила», docs/05-security.md → S1).
// Разбирает исходники AST-деревом TypeScript (а не regex — комментарий или строка «requireStudent» не обманут).
// Правила (усилены по security-reviewer T03):
//  - КАЖДАЯ page.tsx и route.ts в src/app вызывает guard ПЕРВОЙ инструкцией — кроме явного белого списка
//    публичных точек с причиной; в (student) — requireStudent, в (staff) — requireStaff;
//  - guard импортирован из @/server/auth/guards (самописная функция с тем же именем не считается);
//  - каждая экспортируемая функция файла "use server" и каждая функция с "use server" в теле
//    вызывает guard первой инструкцией — или стоит в списке исключений с причиной;
//  - экспорт из "use server", который страж не может распознать как функцию, — нарушение;
//  - layout.tsx guard НЕ вызывает (проверка в layout не защищает, а создаёт ложное чувство защиты).
// В конце страж проверяет сам себя на подложенных «плохих» файлах.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const SRC = join(ROOT, "src");
const GUARDS = ["requireUser", "requireStudent", "requireStaff"] as const;
const GUARDS_MODULE = "@/server/auth/guards";

/** page.tsx без guard — публичные. Ключ — путь от src/. */
const PUBLIC_PAGES: Record<string, string> = {
  "app/(auth)/login/page.tsx": "вход: сессии ещё нет",
  "app/dev/ui/page.tsx": "витрина компонентов без данных; в прод-сборке — notFound()",
  "app/verify/[token]/page.tsx":
    "публичная проверка справки по QR (S7): доступ даёт токен 128 бит, наружу — только статус, тип, дата и инициалы",
};

/** Route handlers без guard. Ключ: «путь:метод». */
const PUBLIC_ROUTES: Record<string, string> = {
  "app/api/health/route.ts:GET":
    "проверка БД для Docker healthcheck, данных пользователей не трогает",
  "app/api/calendar/[token]/route.ts:GET":
    "подписка на расписание по токену 256 бит (S7): календарь читает её без входа, наружу — только пары",
};

/** Server Actions без guard — осознанно. Ключ: «путь:имя». */
const ACTION_EXCEPTIONS: Record<string, string> = {
  "server/actions/auth.ts:login": "вход: сессии ещё нет",
  "server/actions/auth.ts:demoLogin":
    "демо-вход: сессии ещё нет, проверяет DEMO_MODE и список логинов",
  "server/actions/auth.ts:logout": "выход без сессии безвреден — просто удаляет cookie",
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

/** Guards, импортированные из @/server/auth/guards: локальное имя → настоящее (с учётом `as`). */
function importedGuards(sf: ts.SourceFile): Map<string, string> {
  const names = new Map<string, string>();
  for (const st of sf.statements) {
    if (
      ts.isImportDeclaration(st) &&
      ts.isStringLiteral(st.moduleSpecifier) &&
      st.moduleSpecifier.text === GUARDS_MODULE &&
      st.importClause?.namedBindings &&
      ts.isNamedImports(st.importClause.namedBindings)
    ) {
      for (const el of st.importClause.namedBindings.elements) {
        const original = (el.propertyName ?? el.name).text;
        if ((GUARDS as readonly string[]).includes(original)) names.set(el.name.text, original);
      }
    }
  }
  return names;
}

const DIRECTIVE = "use server";
const isDirective = (st: ts.Statement | undefined) =>
  !!st &&
  ts.isExpressionStatement(st) &&
  ts.isStringLiteral(st.expression) &&
  st.expression.text === DIRECTIVE;

/** Первая «настоящая» инструкция тела (директивы "use server" пропускаем). */
function firstStatement(body: ts.Node): ts.Statement | undefined {
  if (!ts.isBlock(body)) return undefined; // стрелка без фигурных скобок — guard первым не вызвать
  return body.statements.find((s) => !isDirective(s));
}

/** Первая инструкция — `await guard()` или `const ctx = await guard()`, guard из модуля guards. */
function startsWithGuard(body: ts.Node, allowed: Map<string, string>): boolean {
  const st = firstStatement(body);
  if (!st) return false;
  let expr: ts.Expression | undefined;
  if (ts.isExpressionStatement(st)) expr = st.expression;
  if (ts.isVariableStatement(st) && st.declarationList.declarations.length === 1) {
    expr = st.declarationList.declarations[0]!.initializer;
  }
  if (!expr || !ts.isAwaitExpression(expr)) return false;
  const call = expr.expression;
  return (
    ts.isCallExpression(call) &&
    ts.isIdentifier(call.expression) &&
    allowed.has(call.expression.text)
  );
}

const hasModifier = (n: ts.Node, kind: ts.SyntaxKind) =>
  ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === kind);

type Fn = { name: string; body: ts.Node };
type ExportScan = { functions: Fn[]; unknown: string[] };

/** Экспорты файла: распознанные функции и всё, что страж распознать не смог. */
function scanExports(sf: ts.SourceFile): ExportScan {
  const functions: Fn[] = [];
  const unknown: string[] = [];
  for (const st of sf.statements) {
    const exported = hasModifier(st, ts.SyntaxKind.ExportKeyword);
    if (ts.isFunctionDeclaration(st) && exported) {
      const name = hasModifier(st, ts.SyntaxKind.DefaultKeyword)
        ? "default"
        : (st.name?.text ?? "?");
      if (st.body) functions.push({ name, body: st.body });
    } else if (ts.isVariableStatement(st) && exported) {
      for (const d of st.declarationList.declarations) {
        const name = ts.isIdentifier(d.name) ? d.name.text : "?";
        const init = d.initializer;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          functions.push({ name, body: init.body });
        } else {
          unknown.push(name);
        }
      }
    } else if (ts.isExportAssignment(st)) {
      unknown.push("default");
    } else if (ts.isExportDeclaration(st)) {
      if (st.isTypeOnly) continue;
      if (st.exportClause && ts.isNamedExports(st.exportClause)) {
        for (const el of st.exportClause.elements) if (!el.isTypeOnly) unknown.push(el.name.text);
      } else {
        unknown.push("*");
      }
    }
  }
  return { functions, unknown };
}

/** Функции с "use server" в теле (inline Server Actions) — где угодно в файле. */
function inlineActions(sf: ts.SourceFile): Fn[] {
  const out: Fn[] = [];
  const visit = (n: ts.Node) => {
    if (
      (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n)) &&
      n.body &&
      ts.isBlock(n.body) &&
      isDirective(n.body.statements[0])
    ) {
      const name =
        (ts.isFunctionDeclaration(n) && n.name?.text) ||
        (ts.isVariableDeclaration(n.parent) &&
          ts.isIdentifier(n.parent.name) &&
          n.parent.name.text) ||
        "(анонимная)";
      out.push({ name, body: n.body });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const fileHasUseServer = (sf: ts.SourceFile) => isDirective(sf.statements[0]);

function defaultExportBody(sf: ts.SourceFile): ts.Node | null {
  return scanExports(sf).functions.find((f) => f.name === "default")?.body ?? null;
}

/** Вызывается ли guard где-то в узле (для правила «layout guard не вызывает»). */
function callsGuardAnywhere(node: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      (GUARDS as readonly string[]).includes(n.expression.text)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

// ── Проверки как чистые функции: их же гоняем на подложенных файлах ───────────

function requiredGuardFor(file: string): string[] {
  if (file.startsWith("app/(student)/")) return ["requireStudent"];
  if (file.startsWith("app/(staff)/")) return ["requireStaff"];
  return [...GUARDS];
}

function pageViolation(file: string, text: string): string | null {
  if (PUBLIC_PAGES[file]) return null;
  const sf = parse(file, text);
  const body = defaultExportBody(sf);
  if (!body) return `${file}: нет export default function`;
  const allowed = new Map(
    [...importedGuards(sf)].filter(([, original]) => requiredGuardFor(file).includes(original)),
  );
  return startsWithGuard(body, allowed)
    ? null
    : `${file}: первая инструкция page — не await ${requiredGuardFor(file).join("/")}() из ${GUARDS_MODULE}`;
}

function actionViolations(
  file: string,
  text: string,
  exceptions: Record<string, string>,
): string[] {
  const sf = parse(file, text);
  const allowed = importedGuards(sf);
  const out: string[] = [];
  if (fileHasUseServer(sf)) {
    const { functions, unknown } = scanExports(sf);
    for (const f of functions) {
      if (!exceptions[`${file}:${f.name}`] && !startsWithGuard(f.body, allowed)) {
        out.push(`${file}: Server Action ${f.name}() без guard первой инструкцией`);
      }
    }
    for (const name of unknown)
      out.push(`${file}: экспорт ${name} не распознан как функция — страж не может его проверить`);
  }
  for (const f of inlineActions(sf)) {
    if (!exceptions[`${file}:${f.name}`] && !startsWithGuard(f.body, allowed)) {
      out.push(`${file}: inline Server Action ${f.name}() без guard первой инструкцией`);
    }
  }
  return out;
}

const HTTP = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
function routeViolations(file: string, text: string, exceptions: Record<string, string>): string[] {
  const sf = parse(file, text);
  const allowed = importedGuards(sf);
  return scanExports(sf)
    .functions.filter((f) => HTTP.includes(f.name))
    .filter((f) => !exceptions[`${file}:${f.name}`] && !startsWithGuard(f.body, allowed))
    .map((f) => `${file}: ${f.name} без guard первой инструкцией`);
}

function layoutViolation(file: string, text: string): string | null {
  return callsGuardAnywhere(parse(file, text))
    ? `${file}: layout вызывает guard — проверка должна быть в каждой page`
    : null;
}

// ── Реальные файлы ───────────────────────────────────────────────────────────

const allFiles = walk(SRC);
const read = (f: string) => readFileSync(f, "utf8");
const appFiles = allFiles.filter((f) => rel(f).startsWith("app/"));

describe("тест-страж: guard в каждой page, Server Action и route handler", () => {
  const pages = appFiles.filter((f) => f.endsWith(`${sep}page.tsx`));

  it("страницы найдены (иначе тест ничего не проверяет)", () => {
    expect(pages.filter((f) => rel(f).startsWith("app/(student)/")).length).toBeGreaterThanOrEqual(
      8,
    );
    expect(pages.filter((f) => rel(f).startsWith("app/(staff)/")).length).toBeGreaterThanOrEqual(1);
  });

  it.each(pages.map((f) => [rel(f), f]))(
    "%s: guard первой инструкцией или в белом списке",
    (_, f) => {
      expect(pageViolation(rel(f), read(f))).toBeNull();
    },
  );

  it("Server Actions (файлы и inline) — guard первой инструкцией или в списке исключений", () => {
    expect(allFiles.some((f) => fileHasUseServer(parse(f)))).toBe(true);
    expect(allFiles.flatMap((f) => actionViolations(rel(f), read(f), ACTION_EXCEPTIONS))).toEqual(
      [],
    );
  });

  it("все route.ts в src/app — guard первой инструкцией или в белом списке", () => {
    const routes = appFiles.filter((f) => f.endsWith(`${sep}route.ts`));
    expect(routes.flatMap((f) => routeViolations(rel(f), read(f), PUBLIC_ROUTES))).toEqual([]);
  });

  it("белые списки не устарели: каждая запись существует", () => {
    for (const file of Object.keys(PUBLIC_PAGES)) {
      expect(defaultExportBody(parse(join(SRC, file))), file).not.toBeNull();
    }
    for (const key of [...Object.keys(ACTION_EXCEPTIONS), ...Object.keys(PUBLIC_ROUTES)]) {
      const [file, name] = key.split(":");
      const fns = scanExports(parse(join(SRC, file!))).functions.map((f) => f.name);
      expect(fns, key).toContain(name);
    }
  });

  it("layout.tsx в (student) и (staff) не вызывают guard", () => {
    const layouts = appFiles.filter(
      (f) => f.endsWith(`${sep}layout.tsx`) && /^app\/\((student|staff)\)\//.test(rel(f)),
    );
    expect(layouts.length).toBeGreaterThanOrEqual(2);
    expect(layouts.map((f) => layoutViolation(rel(f), read(f))).filter(Boolean)).toEqual([]);
  });
});

describe("тест-страж ловит нарушения (проверка самого стража)", () => {
  const IMPORT = `import { requireStudent, requireStaff, requireUser } from "@/server/auth/guards";\n`;
  const P = "app/(student)/x/page.tsx";

  it("page без guard", () => {
    expect(
      pageViolation(P, `${IMPORT}export default async function Page() { return <div /> }`),
    ).not.toBeNull();
  });

  it("guard только в комментарии или строке — не считается", () => {
    const text = `${IMPORT}// requireStudent()
      export default async function Page() { const s = "requireStudent()"; return <div>{s}</div> }`;
    expect(pageViolation(P, text)).not.toBeNull();
  });

  it("guard не первой инструкцией: данные успевают отдаться до проверки", () => {
    const text = `${IMPORT}export default async function Page({ x }) {
      if (x) return <Data />;
      await requireStudent();
      return null }`;
    expect(pageViolation(P, text)).not.toBeNull();
  });

  it("guard внутри неиспользуемой стрелки — не считается", () => {
    const text = `${IMPORT}export default async function Page() { const f = async () => { await requireStudent() }; return null }`;
    expect(pageViolation(P, text)).not.toBeNull();
  });

  it("самописная функция с именем requireStudent — не считается", () => {
    const text = `async function requireStudent() {}
      export default async function Page() { await requireStudent(); return null }`;
    expect(pageViolation(P, text)).not.toBeNull();
  });

  it("не тот guard: requireStaff на странице студента", () => {
    const text = `${IMPORT}export default async function Page() { await requireStaff(); return null }`;
    expect(pageViolation(P, text)).not.toBeNull();
  });

  it("page вне групп без guard — тоже нарушение", () => {
    const text = `export default async function Page() { return <Data /> }`;
    expect(pageViolation("app/requests/[number]/page.tsx", text)).not.toBeNull();
  });

  it("guard первой инструкцией (с ctx и без) — ок, в том числе под другим именем через as", () => {
    expect(
      pageViolation(
        P,
        `${IMPORT}export default async function Page() { const ctx = await requireStudent(); return null }`,
      ),
    ).toBeNull();
    expect(
      pageViolation(
        P,
        `${IMPORT}export default async function Page() { await requireStudent(); return null }`,
      ),
    ).toBeNull();
    expect(
      pageViolation(
        P,
        `import { requireStudent as rs } from "@/server/auth/guards";
        export default async function Page() { await rs(); return null }`,
      ),
    ).toBeNull();
  });

  it("Server Action без guard — и function, и стрелка", () => {
    const text = `"use server";
      ${IMPORT}
      export async function cancelRequest(fd: FormData) { await repo.cancel(fd.get("id")) }
      export const reopen = async () => { await repo.reopen() };
      export async function ok() { const ctx = await requireStudent(); }`;
    expect(actionViolations("server/actions/x.ts", text, {})).toEqual([
      "server/actions/x.ts: Server Action cancelRequest() без guard первой инструкцией",
      "server/actions/x.ts: Server Action reopen() без guard первой инструкцией",
    ]);
  });

  it('нераспознанные экспорты в "use server": обёртка, export { }, export default выражение', () => {
    const text = `"use server";
      const impl = async () => {};
      export const wrapped = withLogging(async () => { await repo.cancel() });
      export { impl };
      export default impl;`;
    const v = actionViolations("server/actions/x.ts", text, {});
    expect(v).toHaveLength(3);
    expect(v.every((s) => s.includes("не распознан"))).toBe(true);
  });

  it('inline "use server" внутри page без guard', () => {
    const text = `${IMPORT}export default async function Page() {
        await requireStudent();
        async function cancel(fd: FormData) { "use server"; await repo.cancel(fd.get("number")) }
        return <form action={cancel} />
      }`;
    expect(actionViolations(P, text, {})).toEqual([
      `${P}: inline Server Action cancel() без guard первой инструкцией`,
    ]);
  });

  it("route handler без guard", () => {
    const text = `export async function GET() { return Response.json(await repo.all()) }`;
    expect(routeViolations("app/verify/[token]/route.ts", text, {})).toHaveLength(1);
  });

  it("layout с guard", () => {
    const text = `${IMPORT}export default async function L({ children }) { await requireStudent(); return children }`;
    expect(layoutViolation("app/(student)/layout.tsx", text)).not.toBeNull();
  });
});
