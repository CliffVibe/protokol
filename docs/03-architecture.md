# 03. Архитектура

## Решения и почему

| Решение | Выбор | Почему |
|---|---|---|
| Фреймворк | **Next.js 16.4.5, App Router** | Фронт и бэк в одном репо — проще для ИИ-агента; Server Components = данные не утекают в браузер; SSR быстро на телефоне |
| Язык | TypeScript 6 strict (+ `noUncheckedIndexedAccess`, typedRoutes) | Агент ловит свои ошибки компилятором. Не TS 7: нативный компилятор без tsserver, совместимость с LSP и Next не проверена |
| Рантайм | **Node.js 24 LTS** (локально, CI, образ `node:24-alpine`) | `@types/node@22` тянет `undici-types@6.21.0` без provenance — его отклоняет `trustPolicy`; для Node 24 типы подписаны. Решение T01, 05.11 |
| БД | **PostgreSQL 16** + Prisma 7.10.1 | Надёжно, индексы, миграции; масштабируется на тысячи студентов |
| Стили | Tailwind v4 + shadcn/ui | Цельный дизайн из коробки, доступные компоненты (Radix) |
| Вход | **Свои сессии** в БД + cookie httpOnly | Прозрачно объяснить жюри «простыми словами»; без сторонних сервисов |
| Хеш паролей | argon2id (`@node-rs/argon2`) | Рекомендация OWASP |
| ИИ-помощник | GigaChat API за серверным прокси, провайдер-абстракция | Доступен из РФ; ключ только на сервере; без ключа — режим «FAQ без ИИ» |
| PDF справок | `@react-pdf/renderer` | Генерация на сервере. Кириллица — только через зарегистрированный TTF (`Font.register`, Inter), иначе текст не отрисуется |
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
  failedLogins Int      @default(0)
  lockedUntil  DateTime?
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

model Announcement { id String @id @default(cuid()) title String  body String  audience Json  /* faculties/groups/courses */  authorId String  publishedAt DateTime  pinned Boolean @default(false) }
model Deadline     { id String @id @default(cuid()) title String  dueAt DateTime  audience Json  link String? }
model Notification { id String @id @default(cuid()) studentId String  kind NotificationKind  title String  body String  link String?  readAt DateTime?  createdAt DateTime @default(now())  @@index([studentId, readAt]) }
model Staff        { id String @id @default(cuid()) userId String @unique  user User @relation(fields:[userId], references:[id])  fullName String  facultyIds String[] }
```

Агенту: это эскиз. Дополни связи (`@relation`) и `StudentLanguageGroup` при реализации T02, но не меняй смысл сущностей без записи в журнал.

## Слои и поток запроса

```
Браузер ──cookie──▶ proxy.ts (есть cookie? нет → /login)   ← только удобство, НЕ защита
                     ▼
               layout (student) ─ только оболочка (навигация); защиты здесь НЕТ
                     ▼
               page (Server Component) ─ requireStudent() → ctx { userId, studentId, groupIds[] }   ← cache(), в каждой page
                     ▼
               repos.schedule.forWeek(ctx, week)
                                                  └─ WHERE groupId IN ctx.groupIds   ← изоляция здесь
Server Action → zod.parse → requireRole → service → repo(ctx) → revalidatePath
```

Защита — в `requireStudent()`/`requireStaff()` и в репозиториях, а не в `proxy.ts`: история CVE-2025-29927 (обход middleware через заголовок) показывает, что полагаться только на прокси нельзя.
И не в layout: в App Router layout не перерисовывается при клиентской навигации и рендерится параллельно со страницей, а `ctx` из layout в page не передать. Поэтому guard вызывается в каждой page, Server Action и route handler; `cache()` убирает повторные запросы к БД в рамках одного рендера.

Правило: `repos/*` — единственное место с `prisma.*`. Каждая функция первым аргументом получает `ctx`. ESLint-правило `no-restricted-imports` запрещает импорт `@/server/db` вне `repos/`.

## Маршруты

| Путь | Кто | Что |
|---|---|---|
| `/login` | все | вход |
| `/` | STUDENT | лента «Сейчас» |
| `/schedule?week=2026-W46` | STUDENT | расписание |
| `/grades`, `/grades/[disciplineId]` | STUDENT | успеваемость |
| `/requests`, `/requests/new`, `/requests/[number]` | STUDENT | заявки (по номеру, но поиск `WHERE studentId = ctx`) |
| `/notifications` | STUDENT | уведомления |
| `/profile` | STUDENT | профиль, безопасность (сменить пароль, выйти со всех устройств, перевыпустить ссылку календаря) |
| `/more` | STUDENT | «Ещё» на мобильном: уведомления, профиль, помощник, тема |
| `/assistant` | STUDENT | ИИ-помощник |
| `/staff`, `/staff/requests/[number]`, `/staff/announcements` | STAFF | кабинет сотрудника |
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
- Бэкап: `pg_dump` по cron раз в сутки.
- Проверка «из РФ без VPN» — открыть с мобильного интернета без VPN.

## Лицензии сторонних материалов

| Что | Лицензия |
|---|---|
| Next.js, React, Prisma, zod, Tailwind | MIT / Apache-2.0 |
| shadcn/ui (CLI `shadcn`, dev), `radix-ui`, `cn` (shadcn-ui/cn) | MIT |
| class-variance-authority | Apache-2.0 |
| tw-animate-css | MIT |
| lucide-react | ISC |
| TypeScript | Apache-2.0 |
| ESLint, eslint-config-next, Prettier, Vitest (dev) | MIT |
| @playwright/test (dev) | Apache-2.0 |
| Docker-образы: `node` (MIT), `postgres` (PostgreSQL License), `caddy` (Apache-2.0) | свободные |
| GitHub Actions: `actions/*`, `pnpm/action-setup` (MIT), `docker/*` (Apache-2.0), `gitleaks-action` (бесплатно для личного репо) | см. `docs/07-tooling.md` |
| Шрифты Manrope, Inter (Google Fonts, self-host через next/font) | OFL |
| @node-rs/argon2 | MIT |
| @axe-core/playwright (dev) | MPL-2.0 |
| Скиллы vercel-labs (react-best-practices, web-interface-guidelines) | MIT |
| Плагины Anthropic (security-guidance и др.) | Apache-2.0 |
| @playwright/mcp, chrome-devtools-mcp (dev) | Apache-2.0 |
| Иллюстрации | только сгенерированные нами или CC0 — указать источник |

Добавляешь зависимость — допиши строку.
