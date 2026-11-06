# T10. Мастер «Зачем нужна справка?», PDF и QR-проверка — план

## Контекст
Последняя «смелая идея» вокруг справок: студент не обязан знать название справки — выбирает цель («Виза»), получает подходящие справки и язык; готовую справку скачивает PDF-ом с QR, а посольство/работодатель сканирует QR и на публичной странице видит «Действительна / Отозвана». Сейчас (T08) `/requests/new` — плоский каталог, при «Готова» уже создаётся `IssuedDocument` с токеном 128 бит, но PDF и `/verify` нет; тест 8 в `tests/e2e/security.spec.ts` — `fixme`.

Решения человека (06.11): security-guidance включён (`.claude/settings.local.json` → true, вернуть false после T10); QR — `uqr@0.1.3`; `@react-pdf/renderer@4.9.0`; TTF PT Sans/PT Serif скачать из google/fonts.

## Шаг 0. Зависимости и шрифты (до кода)
- `pnpm add -E @react-pdf/renderer@4.9.0 uqr@0.1.3` (~33 МБ, 60 пакетов; minimumReleaseAge/trustPolicy не обходим; если упадёт — стоп и вопрос). Затем `pnpm audit --prod`.
- Скачать в `assets/fonts/`: `PT_Sans-Web-Regular.ttf`, `PT_Sans-Web-Bold.ttf`, `PT_Serif-Web-Bold.ttf` + `OFL.txt` (google/fonts, ofl/ptsans и ofl/ptserif). Папка вне `public/` — шрифты читает только сервер.
- `next.config.ts`: `outputFileTracingIncludes` для маршрута PDF → `./assets/fonts/**` (иначе standalone-образ без шрифтов). react-pdf уже во внешних серверных пакетах Next 16 (`server-external-packages.jsonc`) — в клиентский бандл не попадёт.
- Строки в «Лицензии» `03-architecture.md` (react-pdf MIT, uqr MIT, TTF — OFL) и в таблицу версий `07-tooling.md` (uqr + итоги проверки: издатель unjs, 0 зависимостей, без provenance у всех версий).

## Шаг 1. Мастер `PurposePicker` (`/requests/new`)
Всё — GET-параметры и Server Components (работает без JS, назад/вперёд браузера, как фильтры T08). Параметры разбирает zod в `src/lib/request-wizard.ts` (битое → шаг 1, не 500):
1. **Цель** (без параметров): сетка 6 целей из 04-design — «Виза», «Военкомат», «Работа», «Соцзащита», «Стажировка», «Другое» (теги `visa/military/work/social/internship/other` из сида; подпись + lucide-иконка + одна строка «для чего»). Ниже тихая ссылка «Я знаю, какая справка нужна» → `?all=1` (нынешний каталог как есть).
2. **Справки под цель** (`?purpose=visa`): типы, у которых `purposeTags` содержит цель (`getCatalog` + фильтр в сервисе, без нового запроса). Порядок — правило в `request-rules.ts`: для «Виза» сначала справки с английским (`study_en`, затем `embassy`) + пометка «На английском — обычно просят для визы». Это закрывает приёмку 1.
3. **Язык** (`?purpose=visa&type=embassy`) — только если у типа > 1 языка; для визы рекомендованный — английский (первым, с подписью «Рекомендуем»). Тип с одним языком — сразу форма.
4. **Форма** (`…&lang=en` или `?type=…` как раньше): `RequestForm` получает `language` — вместо радио строка «Язык справки: английский · Изменить» (ссылка на шаг 3). Старые ссылки `?type=` (T08, «Подать заново», будущий ИИ T12) работают как прежде.
- Шапка шага: `PageHeader` с «назад» на предыдущий шаг и подписью «Шаг 2 из 3»; заливная кнопка на шагах 1–3 отсутствует (выбор — строки-ссылки, касание по всей строке через `::after`, как каталог T08); заливная — только «Отправить заявку».
- Файлы: `src/app/(student)/requests/new/page.tsx` (разбор шага), `src/components/requests/purpose-picker.tsx`, `type-list.tsx`, `language-step.tsx`; `request-form.tsx` (+проп `language`); `src/server/services/requests.ts` (`typesForPurpose`); `request-rules.ts` (`PURPOSES`, сортировка).

## Шаг 2. PDF справки (только владелец)
- **Маршрут** `src/app/(student)/requests/[number]/pdf/route.ts` (GET): `requireStudent()` первой строкой → `requestNumberSchema` → `repos/requests.documentForPdf(ctx, number)` = `findFirst({ number, studentId: ctx.studentId, status ∈ {READY, ISSUED}, document: { isNot: null } })` с явным select (ФИО, группа/курс/программа/факультет, тип, язык, payload, документ: issuedAt, validUntil, verifyToken, revoked). Нет / чужая / не готова / отозвана → **404** (как страница). Ответ: `application/pdf`, `Content-Disposition: attachment; filename="spravka-С-2026-00042.pdf"` (RFC 5987 для кириллицы), `Cache-Control: private, no-store`.
- Генерация **по запросу** (не храним файлы): данные в БД, PDF детерминирован → нет файлового хранилища, приложение остаётся stateless.
- **Документ** `src/server/pdf/certificate.tsx` (`renderToBuffer`): `Font.register` PT Sans 400/700, PT Serif 700 из `assets/fonts` (путь от `process.cwd()`); A4, цвета палитры «Бланк» (чернила `#22356B`, печать `#55389A`). Содержимое: вымышленная шапка «Протокол — концепт цифрового деканата» + знак-лист (тот же рисунок, что `LogoMark`, через `Svg` react-pdf), заголовок «СПРАВКА» / «CERTIFICATE OF ENROLMENT», № и дата, текст «Дана … в том, что он(а) является студентом(кой) N курса очной формы … факультета …» (адресат — из payload), «Действительна до», подпись «Деканат факультета …» и «М.П.»; блок QR (вектором `Path` из матрицы `uqr.encode`, уровень коррекции M, тихая зона 4 модуля) + «Проверить подлинность: <APP_URL>/verify/<token>». Без номера зачётки и оценок.
- **Английская** версия (`language = "en"`): подписи на английском, ФИО — транслитерация по ICAO 9303 (как в загранпаспорте; `src/lib/translit.ts` + юнит-тест), названия 8 факультетов — словарь в `src/lib/faculty-en.ts`.
- **Водяной знак** по диагонали на каждой странице: «ОБРАЗЕЦ — КОНЦЕПТ ДЛЯ КОНКУРСА» (в задаче — через «·», но по правилу 04-design «·» не используем; заменяю на тире) и внизу строка «Концепт для конкурса. Не является официальным сервисом МГИМО. Все данные вымышлены.»
- **Где кнопка:** на `/requests/[number]` при READY/ISSUED и не отозвана — outline-кнопка «Скачать справку (PDF)» (`<a download>`; заливных кнопок там нет). Текст «Справка готова…» дополняю: «Электронную копию с QR можно показать сразу; оригинал — в деканате». Отозвана — сноска `--danger`: «Деканат отозвал справку: <причина>. Закажите новую» + «Подать заново».
- `APP_URL` — новый модуль `src/lib/app-url.ts` (только сервер, без `NEXT_PUBLIC_`; нет → `http://localhost:3000`).

## Шаг 3. `/verify/[token]` (публично) и отзыв
- **Страница** `src/app/verify/[token]/page.tsx` (вне групп, своя оболочка как `(auth)/layout`, `ConceptBanner` наверху, без `loading.tsx`). Токен — zod (`/^[A-Za-z0-9_-]{22}$/`, base64url 16 байт); битый → «Не найдена» без запроса к БД.
- **Репозиторий** `src/server/repos/verify.ts` — новое исключение «без ctx» (как `system.ts`; дописать в CLAUDE.md и 03-architecture): одна функция `documentByToken(token)` с явным select только `revoked, issuedAt, validUntil, request.type.title, request.language, student.lastName/firstName/middleName`; инициалы («Петрова А. С.») собираются **внутри репозитория** — полное имя из него не выходит.
- Состояния: **Действительна** (`--ok`, `ShieldCheck`, текст), **Отозвана** (`--danger`, `ShieldX`), **Срок истёк** (`--warn`, `validUntil` в прошлом), **Не найдена** (HTTP 404 через `notFound()` + свой `not-found.tsx`: «Справки с таким кодом нет — проверьте, что QR отсканирован целиком»). Показываем только тип, дату выдачи, инициалы (S7). Причину отзыва и дату отзыва — **не** показываем.
- Метаданные: `robots: noindex, nofollow`; заголовок без ФИО. Лимит запросов не нужен: 128 бит перебором не найти — фиксирую это в 03-architecture.
- **Отзыв сотрудником:** миграция `IssuedDocument` + `revokedAt DateTime?`, `revokedReason String?`, `revokedByUserId String?` (SQL — `prisma migrate diff … --script`, `migrate deploy` на protokol и protokol_test). `repos/staff-requests.revokeDocument(ctx, number, reason)`: `updateMany({ request: { number, …ofMyFaculties(ctx) }, revoked: false })` с `count === 1` + уведомление студенту «Справка отозвана» (`assertLink(requestHref)`). Server Action в `src/server/actions/staff.ts`: `requireStaff()` первой строкой, zod (`rejectReasonSchema` — причина 5–500), `revalidatePath`.
- На карточке сотрудника (`/staff/requests/[number]`) при наличии документа — блок «Справка»: выдана, действует до, ссылка «Открыть страницу проверки», и destructive-outline «Отозвать справку» → `DialogForm` (причина, «Отозвать»). Отозвана — «Отозвана <дата>: причина».

## Шаг 4. Тесты
- **Юнит:** PDF содержит «Справка» — свой мини-разбор PDF в тесте (zlib-распаковка потоков, ToUnicode CMap → текст), без новой зависимости; там же «CERTIFICATE» для en и отсутствие номера зачётки. Транслитерация, разбор параметров мастера, сортировка «виза → английский», формат токена.
- **Интеграция (БД):** `documentForPdf` — чужая/не готовая/отозванная → null; `documentByToken` не отдаёт полное имя; `revokeDocument` — чужой факультет → 0, повторный отзыв → conflict.
- **e2e** (`tests/e2e/certificates.spec.ts` + в список исключений eslint, `--repeat-each=3`):
  - мастер: «Виза» → первой «Справка об обучении на английском» (приёмка 1); «Посольство» → шаг языка → форма с английским; «Я знаю…» → каталог; мобильный 360 + axe;
  - **тест 8** в `security.spec.ts` (снимаю `fixme`): анонимно `/verify/<токен справки Алисы из БД>` → «Действительна», тип, инициалы; в HTML нет `recordBookNo` Алисы и её оценок (положительный контроль — значения берутся из БД перед проверкой);
  - Алиса скачивает свой PDF (200, `%PDF`); Тимур по номеру Алисы → 404; аноним → `/login`; **изоляция с положительным контролем**;
  - отзыв: временная заявка+документ (helpers/db.ts, уборка: сначала документ — `onDelete: Restrict`), сотрудник отзывает → `/verify` «Отозвана», PDF → 404; сотрудник чужого факультета не видит кнопку и Action не срабатывает;
  - битый токен → 404, мусорный %-код → 400 (proxy уже).
- После прогона — запрос «что осталось от тестов» в БД.

## Шаг 5. Скриншоты, ревью, документы
- Скриншоты Node-скриптом на Chromium проекта (390 и 1280, обе темы): шаги мастера, заявка с кнопкой PDF, `/verify` во всех 4 состояниях, блок «Справка» у сотрудника. PDF — headed Chromium (встроенный просмотрщик) в PNG; отдельно QR крупно PNG — для проверки камерой телефона по скриншоту до VPS.
- `ux-reviewer` → правки; security-reviewer — **предложу** вам (сам не запускаю); `/security-review` (без origin не запускается — ручная сверка S1, S5, S7 как на T08).
- Документы: план → `docs/process/plans/T10-wizard-pdf-qr.md` (сразу после одобрения); 03-architecture (маршруты `/requests/new` шаги, PDF, `/verify`, исключение `repos/verify.ts`, лицензии), 04-design (раздел «Справки (T10)»), CLAUDE.md (исключение `repos/verify.ts`), README задач (статус), ai-errors (если будут), `/log`; вернуть security-guidance → `false` (с вашего «да» — это `.claude/`).
- Опрос (4 ответа) — сводка после T10 отдельным шагом, в T10 не смешиваю.

## Проверка
```
pnpm format:check && pnpm lint && pnpm typecheck
TEST_DATABASE_URL=postgresql://protokol:protokol@localhost:5432/protokol_test pnpm test
node --test .claude/hooks/guard.test.mjs
E2E_PORT=3105 pnpm test:e2e   (новые spec — --repeat-each=3)
```
Плюс руками: `pnpm dev` на :3000 → войти Алисой → «Заказать справку» → «Виза»; открыть заявку «Готова» → скачать PDF → кириллица видна, QR ведёт на `/verify/…`; войти сотрудником → отозвать → обновить `/verify`. QR камерой — по PNG сейчас, по-настоящему после VPS (cookie требует HTTPS, но `/verify` публичный — с телефона откроется сразу после деплоя).

## Риски
- `trustPolicy`/`minimumReleaseAge` отклонят транзитивный пакет react-pdf → стоп, вопрос вам, без обхода.
- react-pdf и React 19.3: peer `^19.0.0` — ок; если `renderToBuffer` конфликтует с RSC-сборкой — вызывать только из route handler (он и так единственный потребитель).
- Скачанный PDF и прод-CSP: файл отдаётся как вложение, CSP страницы его не касается.
