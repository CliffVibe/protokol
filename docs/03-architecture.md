# 03. Архитектура

## Решения и почему

| Решение | Выбор | Почему |
|---|---|---|
| Фреймворк | **Next.js 16.4.5, App Router** | Фронт и бэк в одном репо — проще для ИИ-агента; Server Components = данные не утекают в браузер; SSR быстро на телефоне |
| Язык | TypeScript 6 strict (+ `noUncheckedIndexedAccess`, typedRoutes) | Агент ловит свои ошибки компилятором. Не TS 7: нативный компилятор без tsserver, совместимость с LSP и Next не проверена |
| Рантайм | **Node.js 24 LTS** (локально, CI, образ `node:24-alpine`) | `@types/node@22` тянет `undici-types@6.21.0` без provenance — его отклоняет `trustPolicy`; для Node 24 типы подписаны. Решение T01, 05.11 |
| БД | **PostgreSQL 16** + Prisma 7.9.0 (драйвер-адаптер `@prisma/adapter-pg`) | Надёжно, индексы, миграции; масштабируется на тысячи студентов |
| Стили | Tailwind v4 + shadcn/ui | Цельный дизайн из коробки, доступные компоненты (Radix) |
| Вход | **Свои сессии** в БД + cookie httpOnly | Прозрачно объяснить жюри «простыми словами»; без сторонних сервисов |
| Хеш паролей | argon2id (`@node-rs/argon2`) | Рекомендация OWASP |
| ИИ-помощник | GigaChat API за серверным прокси, провайдер-абстракция | Доступен из РФ; ключ только на сервере; без ключа — режим «FAQ без ИИ» |
| PDF справок | `@react-pdf/renderer` | Генерация на сервере. Кириллица — только через зарегистрированный TTF (`Font.register`, PT Sans / PT Serif — те же шрифты, что в интерфейсе), иначе текст не отрисуется |
| Тема | cookie `theme` (`light`/`dark`, нет cookie — системная) → класс на `<html>` и `theme-color` ставит сервер | Нет мигания при загрузке и нет inline-скрипта в `<head>`, который запретила бы CSP (S6). Цена — корневой layout динамический; страницы студента и так динамические из-за сессии. Решение T04, 06.11 |
| Тесты | Vitest + Playwright | e2e на десктопе и 360px; тесты изоляции данных |
| Деплой | Docker Compose: app + postgres + caddy (HTTPS) на российском VPS | Открывается из РФ без VPN; одна команда |

### Масштабирование (для отчёта)
Приложение без состояния (stateless) → можно запустить N копий за балансировщиком. Сессии в Postgres (при росте — Redis).
Тяжёлое (PDF, ИИ) — отдельные серверные функции, легко вынести в очередь. Индексы по `studentId`, `groupId`, `date`.

## Модель данных (эскиз для `prisma/schema.prisma`)

```prisma
enum Role { STUDENT STAFF }
enum LessonKind { LECTURE SEMINAR LANGUAGE EXAM CONSULTATION }
enum ChangeKind { NONE MOVED CANCELLED ROOM_CHANGED TEACHER_CHANGED }
enum AssessmentKind { EXAM CREDIT GRADED_CREDIT COURSEWORK }
enum RequestStatus { SUBMITTED ACCEPTED IN_PROGRESS READY ISSUED REJECTED }
enum NotificationKind { ANNOUNCEMENT SCHEDULE_CHANGE DEADLINE REQUEST_STATUS }

model User {
  id           String   @id @default(cuid())
  login        String   @unique
  passwordHash String
  role         Role
  student      Student?
  staff        Staff?
  sessions     Session[]
}

model LoginThrottle {      // блокировка входа по паре «логин + IP» (T03), не по аккаунту
  key         String   @id  // sha256(логин + IP): ни логина, ни IP в открытом виде
  failures    Int
  windowStart DateTime      // окно 15 минут
  lockedUntil DateTime?     // 5 неудач → 5 минут
}

model Session {            // храним ХЕШ токена, сам токен — только в cookie
  id        String   @id      // sha256(token)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  createdAt DateTime @default(now())
  @@index([userId])
}

model Faculty  { id String @id @default(cuid()) code String @unique  name String  programs Program[] }
model Program  { id String @id @default(cuid()) name String  facultyId String  faculty Faculty @relation(fields:[facultyId], references:[id])  groups Group[] }
model Group    { id String @id @default(cuid()) name String  course Int  programId String  program Program @relation(fields:[programId], references:[id])  students Student[] }
model LanguageGroup { id String @id @default(cuid()) language String  level String  name String  members StudentLanguageGroup[] }

model Student {
  id           String  @id @default(cuid())
  userId       String  @unique
  user         User    @relation(fields: [userId], references: [id])
  lastName     String
  firstName    String
  middleName   String?
  recordBookNo String  @unique   // вымышленный
  groupId      String
  group        Group   @relation(fields: [groupId], references: [id])
  languageGroups StudentLanguageGroup[]
  grades       Grade[]
  requests     Request[]
  notifications Notification[]
  calendarToken String  @unique   // для .ics-подписки, перевыпускается
}

model Teacher    { id String @id @default(cuid()) fullName String  /* вымышленный */ }
model Discipline { id String @id @default(cuid()) name String  credits Int }

model Lesson {
  id            String     @id @default(cuid())
  disciplineId  String
  teacherId     String
  kind          LessonKind
  startsAt      DateTime
  endsAt        DateTime
  building      String
  room          String
  groupId       String?          // либо академическая группа,
  languageGroupId String?        // либо языковая
  change        ChangeKind @default(NONE)
  changeNote    String?
  originalStartsAt DateTime?
  @@index([groupId, startsAt])
  @@index([languageGroupId, startsAt])
}

model Grade {
  id           String         @id @default(cuid())
  studentId    String
  disciplineId String
  semester     Int
  kind         AssessmentKind
  ratingPoints Int?           // 0..100 текущий рейтинг
  finalMark    Int?           // 2..5
  passed       Boolean?       // для зачёта
  examDate     DateTime?
  @@index([studentId, semester])
}

model RequestType {
  id          String  @id @default(cuid())
  code        String  @unique
  title       String
  purposeTags String[]        // «виза», «военкомат»… — для мастера «Зачем?»
  languages   String[]        // ["ru","en"]
  slaDays     Int
  fields      Json            // описание доп. полей формы (zod строится из него)
}

model Request {
  id          String        @id @default(cuid())
  number      String        @unique   // человекочитаемый «С-2026-00042»
  studentId   String
  typeId      String
  payload     Json
  status      RequestStatus @default(SUBMITTED)
  events      RequestEvent[]
  document    IssuedDocument?
  createdAt   DateTime @default(now())
  @@index([studentId, createdAt])
  @@index([status])
}

model RequestEvent { id String @id @default(cuid()) requestId String  status RequestStatus  comment String?  actorUserId String  createdAt DateTime @default(now()) }

model IssuedDocument {
  id          String   @id @default(cuid())
  requestId   String   @unique
  verifyToken String   @unique    // 128 бит случайности, в QR
  issuedAt    DateTime
  validUntil  DateTime?
  revoked     Boolean  @default(false)
}

model Announcement { id String @id @default(cuid()) title String  body String  audience Json  /* { facultyCodes?, courses?, groupNames? } — строго эти ключи (src/lib/audience.ts) */  authorId String  publishedAt DateTime  pinned Boolean @default(false) }
model Deadline     { id String @id @default(cuid()) title String  dueAt DateTime  audience Json  link String? }
model Notification { id String @id @default(cuid()) studentId String  kind NotificationKind  title String  body String  link String?  readAt DateTime?  createdAt DateTime @default(now())  @@index([studentId, readAt]) }
model Staff        { id String @id @default(cuid()) userId String @unique  user User @relation(fields:[userId], references:[id])  fullName String  facultyIds String[] }
```

Агенту: это эскиз. Дополни связи (`@relation`) и `StudentLanguageGroup` при реализации T02, но не меняй смысл сущностей без записи в журнал.

**Реализовано в T02** (`prisma/schema.prisma`, Prisma 7: генератор `prisma-client` → `src/generated/prisma`, URL — в `prisma.config.ts`). Дополнения к эскизу, смысл сущностей не менялся:
- `Grade.teacherId` — экзаменатор (детали дисциплины в T07);
- `Request.seq` (`autoincrement`, unique) — основа для номера `С-ГГГГ-NNNNN` без гонок (T08); `Request.language`, `Request.updatedAt`;
- `RequestType.description`; `RequestEvent.actor` → `User`; `Announcement.author` → `Staff`;
- формат `audience` (объявления, дедлайны): `{ facultyCodes?, courses?, groupNames? }`, пустой объект — всем.
- **T12:** `AssistantUsage { id, userId → User (Cascade), createdAt }` + `@@index([userId, createdAt])` — лимит вызовов GigaChat 20/ч; ни вопроса, ни ответа не хранит (миграция `20261107120000_assistant_usage`).

## Слои и поток запроса

```
Браузер ──cookie──▶ proxy.ts (битый %-код в пути → 400; есть cookie? нет → /login)   ← только удобство, НЕ защита
                     ▼
               layout (student) ─ только оболочка (навигация); защиты здесь НЕТ
                     ▼
               page (Server Component) ─ requireStudent() → ctx { userId, studentId, groupIds[] }   ← cache(), в каждой page
                     ▼
               services.schedule.getWeekSchedule / getDaySchedule(ctx, …) → repos.schedule.lessonsBetween(ctx, from, to)
                                                  └─ WHERE groupId IN ctx.groupIds OR languageGroupId IN ctx.languageGroupIds   ← изоляция здесь
Server Action → zod.parse → requireRole → service → repo(ctx) → revalidatePath
```

Защита — в `requireStudent()`/`requireStaff()` и в репозиториях, а не в `proxy.ts`: история CVE-2025-29927 (обход middleware через заголовок) показывает, что полагаться только на прокси нельзя.
И не в layout: в App Router layout не перерисовывается при клиентской навигации и рендерится параллельно со страницей, а `ctx` из layout в page не передать. Поэтому guard вызывается в каждой page, Server Action и route handler; `cache()` убирает повторные запросы к БД в рамках одного рендера.

Правило: `repos/*` — единственное место с `prisma.*`. Каждая функция первым аргументом получает `ctx`. ESLint-правило `no-restricted-imports` запрещает импорт `@/server/db` вне `repos/`.
Исключения без `ctx`: `repos/system.ts` (`pingDb`), `repos/auth.ts` — вход и сессии, где `ctx` ещё нет, его отсюда и получают, `repos/verify.ts` (T10) — публичная проверка справки по токену 128 бит: только статус, тип, дата и инициалы (S7), и `repos/calendar.ts` (T11) — подписка .ics по токену 256 бит: студент ищется только ради его групп, наружу — только пары (S7). В `repos/auth.ts` только явные `select`; `passwordHash` возвращает одна функция (`findLoginCandidate`) и только для `services/auth.ts`.

### Вход и сессии (T03)
- **Токен:** 32 байта `randomBytes` → cookie `__Host-session` (`HttpOnly; Secure; SameSite=Lax; Path=/`), в БД — `sha256`. 7 дней; `getSession()` продлевает срок в БД не чаще раза в сутки, `proxy.ts` обновляет `Max-Age` cookie на переходах (из Server Component cookie ставить нельзя).
- **Вход:** zod (логин ≤ 64, пароль ≤ 128 — длиннее argon2 не вызываем); нет логина → `verifyPassword` с фиктивным argon2id-хешем (одинаковое время ответа); ошибка всегда «Неверный логин или пароль».
- **Блокировка — по паре «логин + IP»** (решение T03 по security-ревью T02): логины жюри публичные, блокировка на аккаунт дала бы любому запереть их вход. 5 неудач за 15 минут → 5 минут; плюс 400 мс задержки после неудачи. Работает и для несуществующих логинов.
  Попытка «занимается» атомарно до argon2 (`reserveAttempt`: один `INSERT … ON CONFLICT DO UPDATE … RETURNING`) — параллельные запросы получают номера 1, 2, 3…, пароль проверяют только первые пять. Старые счётчики удаляются при неудачах, ночной пересев очищает таблицу.
  **Ограничения (осознанно для концепта, security-reviewer T03):** нет общего лимита на IP — с одного адреса можно пробовать по 5 паролей на каждый логин; владелец IPv6 /64 меняет адрес на каждую попытку; жюри за общим NAT может задеть сосед по адресу. Если понадобится — мягкий лимит на IP в приложении или `rate_limit` в Caddy.
- **Откуда IP:** последний адрес `X-Forwarded-For`. На проде его ставит Caddy (заголовок от непроверенного клиента Caddy 2 заменяет адресом соединения), порт приложения наружу не открыт (`expose`). Без Caddy (локально, CI) заголовок подделывается — допустимо: блокировка лишь замедляет перебор, доступ проверяет сессия. e2e пользуются этим, чтобы не копить неудачи на одном адресе.
- **Неверная роль:** студент на `/staff` и сотрудник на страницах студента — редирект в свой кабинет (`notFound()` рисовался бы внутри чужой оболочки).
- **Демо-вход** (`DEMO_MODE=1`): Server Action с `z.enum` из 4 фиксированных логинов; режим проверяется на сервере.
- **CSP с nonce — в `proxy.ts`:** nonce нужен свой на каждый запрос, это умеет только Proxy (локальная документация Next 16.4, `guides/content-security-policy.md`). На проде `script-src`/`style-src` — только `'self'` + nonce (T11: плюс `worker-src 'self'` и `manifest-src 'self'` — при `'strict-dynamic'` слово `'self'` в `script-src` не действует, а `worker-src` без своей директивы берёт `script-src`, и регистрация `/sw.js` упала бы); в dev — `'unsafe-eval'` и inline-стили (горячая замена CSS в Turbopack). Остальные заголовки S6 — в `next.config.ts` и Caddy. Доступ `proxy.ts` по-прежнему не проверяет.
- **Мягкий редирект:** если guard срабатывает после начала стрима (из-за `loading.tsx`), ответ — 200 с `NEXT_REDIRECT` и `<meta http-equiv="refresh">`, без содержимого страницы. Браузер уходит на `/login`; e2e это проверяет.

## Маршруты

| Путь | Кто | Что |
|---|---|---|
| `/login` | все | вход |
| `/` | STUDENT | лента «Сейчас» |
| `/schedule`, `/schedule?day=2026-11-05`, `/schedule?week=2026-W46` | STUDENT | расписание: без параметров — сегодняшний день, `day` — любой день, `week` — неделя (ISO, пн–вс по Москве). Оба параметра разбирает zod (`lib/schedule-params.ts`): битое значение (мусор, 2026-02-30, W54), массив или год дальше ±1 от текущего — сегодня / текущая неделя, не 500 (T06) |
| `/grades`, `/grades?semester=6`, `/grades/[disciplineId]` | STUDENT | успеваемость (T07): `semester` — только семестр студента (zod, `lib/grades-params.ts`), иначе текущий. `disciplineId` — формат через zod (мусор → 404 без запроса), владелец — `repos/grades.disciplineGradesOf(ctx, id)` с `studentId = ctx.studentId`: чужая дисциплина → 404, общая (английский) — только свои строки. Список — в группе `grades/(list)/` со своим `loading.tsx`, у деталей его нет: иначе ответ стримился бы до проверки и 404 пришёл бы со статусом 200 (`loading.md` → «Status codes»). **Тот же приём — для `/requests/[number]` в T08** |
| `/requests`, `/requests/new?type=…`, `/requests/[number]` | STUDENT | заявки (T08). **Мастер T10:** `/requests/new` — цель (`?purpose=visa|military|work|social|internship|other`) → справки под цель (`RequestType.purposeTags`; для визы сначала английские) → язык (`&type=…`, только у справок с двумя языками; для визы рекомендован английский) → форма (`&lang=…`); `?all=1` — полный каталог. Параметры — zod (`lib/request-wizard.ts`), каждый по отдельности: битый или массив — как будто его нет, первый шаг, не 500; старые ссылки `?type=` ведут к языку или сразу к форме. Язык выбран шагом — в форме строкой с «Изменить», сервер всё равно проверяет его по типу. Номер `С-2026-00042` (кириллическая С): формат — zod (`requestNumberSchema`), поиск — `WHERE number AND studentId = ctx` → чужая → 404. Список — в группе `requests/(list)/` со своим skeleton, у заявки его нет (настоящий 404). Форма строится из `RequestType.fields` (описание тоже проверяет zod — битое → тип не предлагается), zod-схема заявки — на сервере. Номер — `nextval` последовательности `seq` в той же транзакции. Двойная отправка: кнопка недоступна + одноразовый `clientKey` (`@@unique([studentId, clientKey])`) — повтор возвращает уже созданную |
| `/notifications`, `/notifications?tab=…` | STUDENT | уведомления (T09): вкладки `all / announcements / deadlines / requests / schedule` (zod, битое → «Все», `lib/notification-tabs.ts`); все запросы — `repos/notifications.ts` с `studentId = ctx` (и мутации: чужой id → count 0). «Открыть» — форма с Server Action (`markRead` + `redirect(safeLink(link))`): GET и prefetch ничего не отмечают. «Объявления» — доска `announcementsFor(ctx)` (фильтр адресата в репозитории), закреплённые сверху, markdown — свой разбор в React-элементы без сырого HTML (`lib/markdown.ts`, S5). Ссылки уведомлений и дедлайнов — `relativeLinkSchema` (`lib/links.ts`) и при записи (`assertLink`), и перед `href` (`safeLink`). Бейдж — `optionalStudent()` в layout (не проверка доступа, без редиректа) + `revalidatePath("/", "layout")` после «прочитано» |
| `/profile` | STUDENT | профиль (T11): свои данные (`repos/profile.profileOf(ctx)`, явный select без зачётки), подписка на расписание (Google — `calendar.google.com/calendar/render?cid=<webcal>`, iPhone — `webcal://`, «Скопировать ссылку»), «Перевыпустить ссылку» — Server Action `rotateCalendarTokenAction`: `requireStudent()` первой строкой, новый токен `randomBytes(32)`, `updateMany({ id: ctx.studentId })` с `count === 1`, `revalidatePath`; подтверждение — `DialogForm`. «Выйти на всех устройствах» — `SessionActions`. Смена пароля — не делали |
| `/more` | STUDENT | «Ещё» на мобильном: уведомления, профиль, помощник, тема |
| `/assistant` | STUDENT | ИИ-помощник (T12): чат, чипы-подсказки, кнопки-действия из whitelist, пометка «Ответы ИИ могут быть неточны» / «отвечаю по базе, без ИИ». Свой skeleton и `error.tsx` (id в адресе нет). Вход — «Ещё» и строка «Спросить помощника» на «Сейчас» |
| `/staff`, `/staff/requests/[number]` | STAFF | кабинет сотрудника (T08). Очередь и карточка — только студенты `staff.facultyIds` (фильтр в КАЖДОМ запросе `repos/staff-requests.ts`, включая мутации), явный `select` студента (ФИО, группа, курс, факультет). Фильтры очереди — zod, чужой факультет игнорируется. Переходы — таблица `TRANSITIONS` (7 шт.), проверка на сервере; смена — `updateMany({ number, status: from, факультет })` с `count === 1` (два сотрудника разом → «статус уже изменили») + событие + уведомление; при «Готова» — `IssuedDocument` с токеном 128 бит (для T10). «Сбросить демо» — `requireStaff` + `DEMO_MODE=1`, `runSeed` (как `db:reset-demo`), все сессии сбрасываются |
| `/staff/announcements` | STAFF | объявления (T09): адресаты — только свои факультеты. `buildAudience` (`services/staff-rules.ts`) отбрасывает чужой факультет и группу, «ничего не выбрано» = все свои (не `{}` «всем»); `repos/staff-announcements.ts` ещё раз фильтрует адресатов по `facultyIds`. Публикация — одна транзакция: объявление + уведомления адресатам (тело — `markdownToPlain` ≤ 200, ссылка — на доску). «Никому» — не публикуем. «Закрепить» — `updateMany({ id, authorId })` |
| `/staff/schedule?group=…&day=…` | STAFF | расписание групп и перенос пары (T09): только академические группы своих факультетов (`repos/staff-schedule.ts`, фильтр в каждом запросе). Перенос — `updateMany({ id, startsAt: ожидаемое, факультет })` с `count === 1` (два сотрудника разом → «пару уже изменили»), длительность сохраняется, `originalStartsAt` — первое исходное время, `change = MOVED`, причина — `changeNote`; уведомление каждому студенту группы со ссылкой `/schedule?day=…`. Время 08:00–21:00, не в прошлое и не дальше 30 дней (zod + `newStartsAt`). Ночной `db:reseed-schedule` возвращает расписание к сиду |
| `/requests/[number]/pdf` | STUDENT, только владелец | PDF справки (T10): route handler, `requireStudent()` первой строкой; `repos/requests.documentForPdf` — `WHERE number AND studentId = ctx AND status ∈ {READY, ISSUED} AND документ не отозван`, явный select без зачётки и оценок; иначе 404 без тела (чужую, неготовую и отозванную не различаем). Генерация по запросу, файлы не храним (stateless): `@react-pdf/renderer`, TTF PT Sans/PT Serif из `assets/fonts` (`outputFileTracingIncludes` кладёт их в standalone), QR — вектор из матрицы `uqr` (ECC M, тихая зона 4) на `APP_URL/verify/<token>`; англ. версия — ФИО по ICAO 9303, факультеты — `lib/certificate-en.ts`. `Cache-Control: private, no-store`. Шрифты регистрируются заново на каждый документ, рендеры — по очереди (кэш глифов fontkit портил ToUnicode следующей справки — см. `docs/process/ai-errors.md`, T10) |
| `/verify/[token]` | публично | проверка справки по QR (T10, S7). Токен — zod (22 символа base64url), битый → 404 без запроса к БД. `repos/verify.ts` — исключение «без ctx» (как `system.ts`): доступ даёт сам токен (128 бит, перебором не найти — лимит запросов не нужен). Наружу — только «действительна / отозвана / срок истёк», тип, дата выдачи, «действует до» (решение человека 07.11, S7) и инициалы; полное ФИО превращается в инициалы внутри репозитория, причина отзыва в выборку не входит. Двуязычная (английский — строкой под русским: справку для визы проверяет посольство). Без `loading.tsx` — «не найдена» отдаёт настоящий 404; `robots: noindex`, `referrer: no-referrer`. **Отзыв** — сотрудник своего факультета на карточке заявки: `updateMany({ id, revoked: false, факультет })` с `count === 1` (двое разом → conflict), `revokedAt/revokedReason/revokedByUserId` + уведомление студенту в той же транзакции; причину видит только студент |
| `/dev/ui` | только `pnpm dev` | витрина компонентов; в прод-сборке 404 |
| `/api/calendar/[token]` | по токену | подписка на расписание (T11, S7). Файл `route.ts`; ссылка вида `…/<token>.ics`, суффикс `.ics` отрезаем в обработчике (папка `[token].ics` — недопустимый динамический сегмент). Токен — zod (43 символа base64url = 32 байта), битый → 404 без тела и без запроса к БД; неизвестный/перевыпущенный → тот же 404. `repos/calendar.ts` — исключение «без ctx»: студент по `calendarToken` (только `groupId` и языковые группы), пары −14 … +90 дней. Генератор — свой `lib/ics.ts` (RFC 5545: CRLF, складывание по 75 байтам UTF-8, экранирование), без зависимостей; UID — `<lesson.id>@protokol`, время в UTC, отмена — `STATUS:CANCELLED`, перенос/замена — в описании. Внутри — дисциплина, вид, аудитория, вымышленный преподаватель; ни ФИО, ни группы, ни оценок. `text/calendar`, `Cache-Control: private, no-store`, `X-Robots-Tag: noindex`. Лимит запросов не нужен: 256 бит перебором не найти |
| `/api/assistant` | STUDENT | стрим ответа помощника (T12, NDJSON): `POST`, `requireStudent()` первой строкой, zod-тело без id студента, `Cache-Control: no-store`. Без входа — 307 на `/login`. Подробно — «ИИ-помощник» ниже |

## PWA и офлайн (T11)

- **Манифест** — `src/app/manifest.ts` → `/manifest.webmanifest`; значки — `public/icons/*.png` и `src/app/apple-icon.png`, рисует `scripts/render-icons.mjs` из `icon.svg` Chromium-ом Playwright (без новых зависимостей).
- **Service worker** — свой `public/sw.js`, без библиотек: `/_next/static/*` — cache-first (≤ 150 записей); навигация на `/schedule` — network-first с копией в кэш `protokol-pages`; голый `/schedule` без сети ищет `?day=<сегодня по Москве>`; прочая навигация без сети — `public/offline.html`. Две недели (сегодня, 14 дней, 2 недели — 17 адресов) считает сервер (`offlineScheduleUrls`) и отдаёт воркеру со страницы расписания (`components/pwa/offline-schedule.tsx`) вместе с уже загруженными файлами `_next/static` (первый визит прошёл до воркера); перекачка — не чаще раза в 6 ч. Клиентский переход по дню без сети: Next откатывается на обычную навигацию, её ловит воркер.
- **Регистрация** — `components/pwa/pwa-shell.tsx` в оболочке студента, только в прод-сборке (в dev кэш чанков ломал бы горячую замену). Офлайн-плашка — `role="status"`, на расписании со временем сохранения страницы.
- **Выход стирает кэш страниц** (общий компьютер): страница входа (`ClearOfflineData`) и воркер при редиректе на `/login`; счётчик `generation` в воркере не даёт докачке, начатой до выхода, положить страницы обратно (гонку поймал e2e).
- **proxy.ts:** `sw.js`, `manifest.webmanifest`, `icons/`, `apple-icon.png`, `offline.html|css` исключены из matcher — без cookie их уводило бы на `/login`. `/sw.js` — `Cache-Control: no-cache` (`next.config.ts`).
- **e2e:** воркер заблокирован во всех spec (`serviceWorkers: "block"`), включён только в `pwa.spec.ts`.

## Тестовые базы (T13)

- **e2e — своя база `protokol_e2e`** на том же локальном Postgres: имя подменяется в `DATABASE_URL` (`tests/e2e/e2e-db.ts`; явная строка — `E2E_DATABASE_URL`), `.env` менять не нужно. Перед сборкой сервера `tests/e2e/prepare-db.ts` создаёт базу, если её нет, применяет миграции и сеет заново — так e2e не видны в демо человека (раньше Тимур во время прогона видел тестовое объявление) и не зависят от даты последнего пересева демо. Уборка тестов (`helpers/db.ts`) и сид работают только с локальной базой с этим именем.
- **Порт e2e — 3100**: `reuseExistingServer` не подхватит dev-сервер на 3000, который смотрит в демо-базу.
- **Интеграция Vitest** (`TEST_DATABASE_URL`) пересеивает свою базу — локально направляем её туда же, в `protokol_e2e` (не одновременно с e2e). В CI обе — одноразовая база сервиса.
- Миграции на локальные базы: демо — `pnpm db:deploy`; `protokol_e2e` — сама, при каждом прогоне e2e.

## ИИ-помощник (T12)

- **Поток:** `/assistant` (чат, `components/assistant/chat.tsx`) → `POST /api/assistant` (`requireStudent()` первой строкой; zod: 1–6 реплик `user|assistant` по ≤ 1000 символов, последняя — `user`; тело ≤ 16 КБ — читается по кусочкам с подсчётом байтов, без `Content-Length` тоже не буферизуется целиком; чужой `Origin` → 403; мягкий лимит частоты 60 запросов в минуту на пользователя в памяти процесса — `services/ai/throttle.ts`, 429; оба — по замечаниям security-reviewer T12) → `services/ai/assistant.answer(ctx, history)` → NDJSON `{"t":"delta"}`… `{"t":"done","mode":"ai"|"faq","actions":[…],"notice"?}`. Истории в БД нет — только на странице.
- **Контекст** (`services/ai/context.ts`) — **только текущий студент**, через те же репозитории с `ctx`, что его экраны: пары на 7 дней (`lessonsBetween`), сводка оценок, долги, стипендия, ближайший контроль (`gradesOf` + `summarizeStudy`/`sessionSummary`), активные заявки (`activeRequests`), имя и группа (`readerOf`). Без номера зачётки, id и токенов. Вопрос и история — отдельные реплики, в системный промпт не вклеиваются.
- **Порядок ответа:** вопрос о другом человеке («оценки Тимура», «другого студента», «одногруппника») → вежливый отказ **без модели** (`intents.asksAboutOtherPerson`) → есть ключ → `reserveAiCall` (20 в час) → GigaChat потоком → лимит, сбой сети/TLS/401/429 или пустой ответ → ответ по базе с пометкой. Без ключа или при `ASSISTANT_PROVIDER=faq` (так работают e2e) — сразу по базе: свои данные по правилам (`intents.answerFromData`: следующий экзамен, пары сегодня/завтра, мои заявки, долги и стипендия), иначе лучшая статья FAQ.
- **FAQ** — `content/faq/*.md` (13 вымышленных статей; frontmatter `title`/`keywords`/`actions`), свой поиск без зависимостей (`services/ai/faq.ts`: основы по 5 букв, ё → е, очки ключ ×3 / заголовок ×2 / текст ×1, порог 3). 3 лучшие статьи идут и в промпт GigaChat. В standalone их кладёт `outputFileTracingIncludes["/api/assistant"]`.
- **Действия** — только id из whitelist `lib/assistant-actions.ts` (14 внутренних маршрутов: расписание, «Учёба», «Что если…», заявки, 6 целей мастера справок, уведомления, профиль). Модель пишет последней строкой `ДЕЙСТВИЯ: id1, id2`; сервер придерживает эту строку в потоке (`line-gate.ts`), отбрасывает неизвестное (адреса, `javascript:`), не больше 3, и отдаёт готовые `{label, href}`. Ссылки из текста модели не рисуются (`Markdown links={false}`). Модель ничего не меняет: у неё нет инструментов, кнопка — обычная ссылка, страница проверяет всё заново.
- **GigaChat без SDK** (`services/ai/gigachat.ts`, только `fetch`): OAuth `ngw.devices.sberbank.ru:9443/api/v2/oauth` (Basic-ключ, `RqUID`, scope `GIGACHAT_API_PERS`), токен в памяти до `expires_at − 60 с`, при 401 — один повтор с новым; `gigachat.devices.sberbank.ru/api/v1/chat/completions`, `GigaChat-2` (Lite), `stream: true`, temperature 0.2, `max_tokens` 600, таймаут 20 с; SSE разбирается с разрывами строк и UTF-8. Ошибка — только стадия и код (`oauth: http:429`, `tls:…`), без ключа и тела ответа.
- **TLS:** серверы Сбера подписаны «Russian Trusted Root CA» (Минцифры). Сертификат — `certs/russian_trusted_root_ca.pem` (публичный, источник и отпечаток — `07-tooling.md`); в образе — `ENV NODE_EXTRA_CA_CERTS`, локально `pnpm start` задаёт его дочернему `server.js` (`scripts/start-standalone.mjs`), для `pnpm dev` — переменной при запуске. Проверка TLS не отключается нигде (без сертификата Node падает на `SELF_SIGNED_CERT_IN_CHAIN` — помощник отвечает по базе). Переменная действует на весь процесс; сейчас единственный исходящий `fetch` сервера — GigaChat. Появятся другие внешние запросы — передавать CA только в GigaChat (undici `Agent({ connect: { ca } })`) и убрать глобальную переменную (security-reviewer T12).
- **Лимит** — `AssistantUsage(userId, createdAt)`, только время вызова, без текстов; `repos/assistant.reserveAiCall(ctx)`: транзакция с `pg_advisory_xact_lock(hashtext(userId))` → удалить старше часа → подсчёт → вставка, если < 20 (25 параллельных → ровно 20). Считаются только вызовы GigaChat, FAQ бесплатен (решение человека 07.11): после лимита — «ИИ вернётся в HH:MM, отвечаю по базе».
- **«Черновик ответа» сотруднику** (`services/ai/draft.ts`, `draftReplyAction`): кнопка «Подготовить черновик» на карточке заявки → текст комментария к первому шагу вперёд ставится в поле; отправляет сотрудник сам обычной кнопкой перехода. `requireStaff()`, заявка — `staffRequestByNumber` (фильтр факультета: чужая → «не найдена»), переход — `canTransition`. Во внешний сервис — тип справки, статусы, срок и **подписи** полей, без значений и без ФИО. Без ключа или после лимита — шаблон по статусу. Тот же лимит 20/ч. Авто-категорию заявки не делали (тип выбирает сам студент в мастере).
- **Логи** — `{"event":"assistant","mode","ms","code"?}`: без текста вопроса, имени и id.
- Ключ `GIGACHAT_AUTH_KEY` — только env сервера (S4); на страницу уходит лишь «есть ИИ / нет» для подписи. Тест 5 ищет значение ключа в HTML `/assistant`, ответе `/api/assistant` и всех бандлах.

## Деплой

- `docker-compose.prod.yml`: `app` (Next standalone), `db` (postgres:16, volume), `caddy` (автоматический HTTPS Let's Encrypt).
- **Образ собирается в GitHub Actions** (`.github/workflows/image.yml`) и лежит в GHCR (`ghcr.io/cliffvibe/protokol`). VPS только скачивает его: `next build` на 2 ГБ RAM рядом с Postgres и Caddy может упасть по памяти.
- VPS у российского провайдера (Timeweb Cloud / Selectel / Yandex Cloud), 1–2 vCPU, 2 ГБ RAM + **swap 2 ГБ**.
- Docker Hub с российских VPS бывает недоступен: в `/etc/docker/daemon.json` прописываем `"registry-mirrors": ["https://mirror.gcr.io"]` и в первый же день проверяем `docker pull postgres:16`.
- Домен: недорогой `.ru`, либо поддомен вида `<ip>.sslip.io` на время разработки.
- Секреты — в `.env` на сервере (не в репо). `.env.example` — в репо.
- **Миграции и демо-данные** — отдельный образ `:tools` (цель `tools` в `Dockerfile`: Prisma CLI + tsx; в приложение не входит, ~1,7 ГБ):
  - после каждого деплоя: `docker compose -f docker-compose.prod.yml run --rm tools pnpm db:deploy`;
  - ночной пересев демо (06-seed-data → «Демо-режим»), crontab на VPS: `CRON_TZ=Europe/Moscow` + `0 4 * * * cd /opt/protokol && docker compose -f docker-compose.prod.yml run --rm tools pnpm db:reset-demo >> /var/log/protokol-reset.log 2>&1`.
- `/api/health` → `{ ok, db }` (503, если БД недоступна) — его же проверяет Docker healthcheck (изнутри контейнера, `127.0.0.1:3000`). Снаружи Caddy отвечает на этот адрес 404 (`respond /api/health 404`, T13): состояние БД посторонним знать незачем.
- Бэкап: `pg_dump` по cron раз в сутки.
- Проверка «из РФ без VPN» — открыть с мобильного интернета без VPN.

## Лицензии сторонних материалов

| Что | Лицензия |
|---|---|
| Next.js, React, Prisma, zod (4.6.7), Tailwind | MIT / Apache-2.0 |
| shadcn/ui (CLI `shadcn`, dev), `radix-ui`, `cn` (shadcn-ui/cn) | MIT |
| class-variance-authority | Apache-2.0 |
| tw-animate-css | MIT |
| lucide-react | ISC |
| TypeScript | Apache-2.0 |
| ESLint, eslint-config-next, Prettier, Vitest (dev) | MIT |
| @playwright/test (dev) | Apache-2.0 |
| Docker-образы: `node` (MIT), `postgres` (PostgreSQL License), `caddy` (Apache-2.0) | свободные |
| GitHub Actions: `actions/*`, `pnpm/action-setup` (MIT), `docker/*` (Apache-2.0), `gitleaks-action` (бесплатно для личного репо) | см. `docs/07-tooling.md` |
| Шрифты PT Sans, PT Serif (ParaType, Google Fonts, self-host через next/font) | OFL |
| @node-rs/argon2 | MIT |
| @axe-core/playwright (dev) | MPL-2.0 |
| @react-pdf/renderer 4.9.0 (PDF справок, T10; тянет pdfkit, fontkit, yoga-layout — MIT) | MIT |
| uqr 0.1.3 (матрица QR-кода, unjs, без зависимостей, T10) | MIT |
| Сертификат «Russian Trusted Root CA» (Минцифры России, `certs/`, T12) — публичный корневой сертификат, только для проверки TLS GigaChat | публичный, без ограничений |
| GigaChat API (Сбер, T12) — внешний сервис по ключу физлица, без SDK | условия использования GigaChat API |
| TTF PT Sans 400/700, PT Serif 700 для PDF (`assets/fonts`, из github.com/google/fonts, лицензия рядом — `OFL.txt`) | OFL |
| Скиллы vercel-labs (react-best-practices, web-interface-guidelines) | MIT |
| Плагины Anthropic (security-guidance и др.) | Apache-2.0 |
| @playwright/mcp, chrome-devtools-mcp (dev) | Apache-2.0 |
| Иллюстрации | только сгенерированные нами или CC0 — указать источник |

Добавляешь зависимость — допиши строку.
