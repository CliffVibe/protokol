# T03. Вход, сессии, изоляция

> Перед началом человек включает security-guidance на время задачи (см. `docs/07-tooling.md`).

**Цель:** безопасный вход и гарантия «студент видит только свои данные». Перечитай `docs/05-security.md` целиком.

## Сделать
- `src/server/auth/`: `hashPassword`, `verifyPassword`, `createSession`, `getSession`, `destroySession`, `destroyAllSessions`.
- `requireUser()`, `requireStudent()` → `ctx { userId, studentId, groupIds, languageGroupIds }`, `requireStaff()` → `ctx { userId, staffId, facultyIds }`. Все обёрнуты в React `cache()` и вызываются в каждой page / Server Action / route handler, не в layout.
- `tests/unit/guards.test.ts` — тест-страж: каждый `page.tsx` в `(student)` вызывает `requireStudent`, в `(staff)` — `requireStaff`.
- Демо-вход (при `DEMO_MODE=1`, см. `06-seed-data.md`): кнопки «Войти как…» для фиксированного списка демо-логинов, плашка «демо-режим», блок «6 сценариев для проверки».
- `proxy.ts` (так в Next 16 называется middleware; см. `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`): без cookie → `/login` (кроме `/login`, `/verify/*`, `/api/calendar/*`, статики).
- Страница `/login`: логин, пароль, показать/скрыть пароль, ошибки, блокировка после 5 попыток, `ConceptBanner`, подсказка «Тестовые аккаунты — в описании работы».
- Выход; после входа STAFF → `/staff`, STUDENT → `/`.
- Заголовки безопасности (S6) в `next.config.ts`.
- `tests/e2e/security.spec.ts` — все 8 тестов из `05-security.md` (те, что пока нельзя — `test.fixme` с пометкой задачи).

## Из security-ревью T02 (06.11) — учесть здесь
- zod-схема входа: `password` — `max(128)` (argon2 на мегабайтном вводе = дешёвая DoS), `login` — `max(64)`.
- «Нет такого логина»: всё равно вызывать `verifyPassword` с заранее посчитанным фиктивным хешем — иначе по времени ответа видно, что логина нет (S2: «ошибка одинаковая»).
- Блокировка после 5 попыток на **публичных** логинах жюри даёт любому возможность блокировать вход жюри. Считать попытки по паре «логин + IP» (или IP-лимит + мягкая задержка), записать решение в журнал.
- Репозитории возвращают явный `select`, без `include` целых `User`/`Student` — иначе `passwordHash`, `calendarToken`, `recordBookNo` уйдут в RSC-payload.
- e2e-тесты изоляции не должны опираться на предсказуемость id сида (`stu-alisa`, `req-0001`): брать номер заявки А через её же сессию.

## Приёмка
- [ ] Все тесты безопасности, доступные на этом этапе, зелёные
- [ ] `security-reviewer` и security-guidance не нашли блокеров; `/security-review` чистый (вывод → журнал)
- [ ] Вход и выход работают на 360px
