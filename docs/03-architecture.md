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
Исключения без `ctx`: `repos/system.ts` (`pingDb`) и `repos/auth.ts` — вход и сессии, где `ctx` ещё нет, его отсюда и получают. В `repos/auth.ts` только явные `select`; `passwordHash` возвращает одна функция (`findLoginCandidate`) и только для `services/auth.ts`.

### Вход и сессии (T03)
- **Токен:** 32 байта `randomBytes` → cookie `__Host-session` (`HttpOnly; Secure; SameSite=Lax; Path=/`), в БД — `sha256`. 7 дней; `getSession()` продлевает срок в БД не чаще раза в сутки, `proxy.ts` обновляет `Max-Age` cookie на переходах (из Server Component cookie ставить нельзя).
- **Вход:** zod (логин ≤ 64, пароль ≤ 128 — длиннее argon2 не вызываем); нет логина → `verifyPassword` с фиктивным argon2id-хешем (одинаковое время ответа); ошибка всегда «Неверный логин или пароль».
- **Блокировка — по паре «логин + IP»** (решение T03 по security-ревью T02): логины жюри публичные, блокировка на аккаунт дала бы любому запереть их вход. 5 неудач за 15 минут → 5 минут; плюс 400 мс задержки после неудачи. Работает и для несуществующих логинов.
  Попытка «занимается» атомарно до argon2 (`reserveAttempt`: один `INSERT … ON CONFLICT DO UPDATE … RETURNING`) — параллельные запросы получают номера 1, 2, 3…, пароль проверяют только первые пять. Старые счётчики удаляются при неудачах, ночной пересев очищает таблицу.
  **Ограничения (осознанно для концепта, security-reviewer T03):** нет общего лимита на IP — с одного адреса можно пробовать по 5 паролей на каждый логин; владелец IPv6 /64 меняет адрес на каждую попытку; жюри за общим NAT может задеть сосед по адресу. Если понадобится — мягкий лимит на IP в приложении или `rate_limit` в Caddy.
- **Откуда IP:** последний адрес `X-Forwarded-For`. На проде его ставит Caddy (заголовок от непроверенного клиента Caddy 2 заменяет адресом соединения), порт приложения наружу не открыт (`expose`). Без Caddy (локально, CI) заголовок подделывается — допустимо: блокировка лишь замедляет перебор, доступ проверяет сессия. e2e пользуются этим, чтобы не копить неудачи на одном адресе.
- **Неверная роль:** студент на `/staff` и сотрудник на страницах студента — редирект в свой кабинет (`notFound()` рисовался бы внутри чужой оболочки).
- **Демо-вход** (`DEMO_MODE=1`): Server Action с `z.enum` из 4 фиксированных логинов; режим проверяется на сервере.
- **CSP с nonce — в `proxy.ts`:** nonce нужен свой на каждый запрос, это умеет только Proxy (локальная документация Next 16.4, `guides/content-security-policy.md`). На проде `script-src`/`style-src` — только `'self'` + nonce; в dev — `'unsafe-eval'` и inline-стили (горячая замена CSS в Turbopack). Остальные заголовки S6 — в `next.config.ts` и Caddy. Доступ `proxy.ts` по-прежнему не проверяет.
- **Мягкий редирект:** если guard срабатывает после начала стрима (из-за `loading.tsx`), ответ — 200 с `NEXT_REDIRECT` и `<meta http-equiv="refresh">`, без содержимого страницы. Браузер уходит на `/login`; e2e это проверяет.

## Маршруты

| Путь | Кто | Что |
|---|---|---|
| `/login` | все | вход |
| `/` | STUDENT | лента «Сейчас» |
| `/schedule`, `/schedule?day=2026-11-05`, `/schedule?week=2026-W46` | STUDENT | расписание: без параметров — сегодняшний день, `day` — любой день, `week` — неделя (ISO, пн–вс по Москве). Оба параметра разбирает zod (`lib/schedule-params.ts`): битое значение (мусор, 2026-02-30, W54), массив или год дальше ±1 от текущего — сегодня / текущая неделя, не 500 (T06) |
| `/grades`, `/grades?semester=6`, `/grades/[disciplineId]` | STUDENT | успеваемость (T07): `semester` — только семестр студента (zod, `lib/grades-params.ts`), иначе текущий. `disciplineId` — формат через zod (мусор → 404 без запроса), владелец — `repos/grades.disciplineGradesOf(ctx, id)` с `studentId = ctx.studentId`: чужая дисциплина → 404, общая (английский) — только свои строки. Список — в группе `grades/(list)/` со своим `loading.tsx`, у деталей его нет: иначе ответ стримился бы до проверки и 404 пришёл бы со статусом 200 (`loading.md` → «Status codes»). **Тот же приём — для `/requests/[number]` в T08** |
| `/requests`, `/requests/new?type=…`, `/requests/[number]` | STUDENT | заявки (T08). Номер `С-2026-00042` (кириллическая С): формат — zod (`requestNumberSchema`), поиск — `WHERE number AND studentId = ctx` → чужая → 404. Список — в группе `requests/(list)/` со своим skeleton, у заявки его нет (настоящий 404). Форма строится из `RequestType.fields` (описание тоже проверяет zod — битое → тип не предлагается), zod-схема заявки — на сервере. Номер — `nextval` последовательности `seq` в той же транзакции. Двойная отправка: кнопка недоступна + одноразовый `clientKey` (`@@unique([studentId, clientKey])`) — повтор возвращает уже созданную |
| `/notifications`, `/notifications?tab=…` | STUDENT | уведомления (T09): вкладки `all / announcements / deadlines / requests / schedule` (zod, битое → «Все», `lib/notification-tabs.ts`); все запросы — `repos/notifications.ts` с `studentId = ctx` (и мутации: чужой id → count 0). «Открыть» — форма с Server Action (`markRead` + `redirect(safeLink(link))`): GET и prefetch ничего не отмечают. «Объявления» — доска `announcementsFor(ctx)` (фильтр адресата в репозитории), закреплённые сверху, markdown — свой разбор в React-элементы без сырого HTML (`lib/markdown.ts`, S5). Ссылки уведомлений и дедлайнов — `relativeLinkSchema` (`lib/links.ts`) и при записи (`assertLink`), и перед `href` (`safeLink`). Бейдж — `optionalStudent()` в layout (не проверка доступа, без редиректа) + `revalidatePath("/", "layout")` после «прочитано» |
| `/profile` | STUDENT | профиль, безопасность (сменить пароль, выйти со всех устройств, перевыпустить ссылку календаря) |
| `/more` | STUDENT | «Ещё» на мобильном: уведомления, профиль, помощник, тема |
| `/assistant` | STUDENT | ИИ-помощник |
| `/staff`, `/staff/requests/[number]` | STAFF | кабинет сотрудника (T08). Очередь и карточка — только студенты `staff.facultyIds` (фильтр в КАЖДОМ запросе `repos/staff-requests.ts`, включая мутации), явный `select` студента (ФИО, группа, курс, факультет). Фильтры очереди — zod, чужой факультет игнорируется. Переходы — таблица `TRANSITIONS` (7 шт.), проверка на сервере; смена — `updateMany({ number, status: from, факультет })` с `count === 1` (два сотрудника разом → «статус уже изменили») + событие + уведомление; при «Готова» — `IssuedDocument` с токеном 128 бит (для T10). «Сбросить демо» — `requireStaff` + `DEMO_MODE=1`, `runSeed` (как `db:reset-demo`), все сессии сбрасываются |
| `/staff/announcements` | STAFF | объявления (T09): адресаты — только свои факультеты. `buildAudience` (`services/staff-rules.ts`) отбрасывает чужой факультет и группу, «ничего не выбрано» = все свои (не `{}` «всем»); `repos/staff-announcements.ts` ещё раз фильтрует адресатов по `facultyIds`. Публикация — одна транзакция: объявление + уведомления адресатам (тело — `markdownToPlain` ≤ 200, ссылка — на доску). «Никому» — не публикуем. «Закрепить» — `updateMany({ id, authorId })` |
| `/staff/schedule?group=…&day=…` | STAFF | расписание групп и перенос пары (T09): только академические группы своих факультетов (`repos/staff-schedule.ts`, фильтр в каждом запросе). Перенос — `updateMany({ id, startsAt: ожидаемое, факультет })` с `count === 1` (два сотрудника разом → «пару уже изменили»), длительность сохраняется, `originalStartsAt` — первое исходное время, `change = MOVED`, причина — `changeNote`; уведомление каждому студенту группы со ссылкой `/schedule?day=…`. Время 08:00–21:00, не в прошлое и не дальше 30 дней (zod + `newStartsAt`). Ночной `db:reseed-schedule` возвращает расписание к сиду |
| `/verify/[token]` | публично | проверка справки |
| `/dev/ui` | только `pnpm dev` | витрина компонентов; в прод-сборке 404 |
| `/api/calendar/[token]` | по токену | подписка на расписание. Файл `route.ts`; ссылка вида `…/<token>.ics`, суффикс `.ics` отрезаем в обработчике (папка `[token].ics` — недопустимый динамический сегмент) |
| `/api/assistant` | STUDENT | стрим ответа ИИ |

## ИИ-помощник (если дойдём до T12)

- Сервер собирает контекст **только текущего студента** (ближайшие пары, оценки, заявки) + вымышленную базу FAQ (`content/faq/*.md`).
- Модель возвращает текст + опциональные «действия» (`open:/requests/new?type=visa_en`) — клиент рисует кнопки. Модель ничего не меняет сама.
- Ключ `GIGACHAT_AUTH_KEY` только в env сервера. Лимит запросов на пользователя. Без ключа — поиск по FAQ.
- TLS GigaChat подписан «Russian Trusted Root CA» (Минцифры): сертификат кладём в образ и указываем в `NODE_EXTRA_CA_CERTS`. Проверку TLS не отключаем.
- Ключ получает человек через Sber ID — заранее, это может занять время.
- Логи запросов без персональных данных.

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
- `/api/health` → `{ ok, db }` (503, если БД недоступна) — его же проверяет Docker healthcheck.
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
| Скиллы vercel-labs (react-best-practices, web-interface-guidelines) | MIT |
| Плагины Anthropic (security-guidance и др.) | Apache-2.0 |
| @playwright/mcp, chrome-devtools-mcp (dev) | Apache-2.0 |
| Иллюстрации | только сгенерированные нами или CC0 — указать источник |

Добавляешь зависимость — допиши строку.
