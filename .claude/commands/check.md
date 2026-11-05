---
description: Полная проверка перед коммитом/деплоем
---
Выполни по очереди и кратко доложи результат каждого шага:
1. `pnpm lint && pnpm typecheck`
2. `pnpm test`
3. `pnpm test:e2e` (оба проекта)
4. `grep -rn "NEXT_PUBLIC_" src` — убедись, что нет секретов
5. `git status` — нет ли `.env` и мусора
6. `node --test .claude/hooks/guard.test.mjs`
7. Вызови субагента `security-reviewer`, если с прошлого коммита менялись `src/server/`, `src/app/api/`, `proxy.ts` или Server Actions.
Если всё зелёное — предложи текст коммита.
