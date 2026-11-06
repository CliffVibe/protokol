> План T09 из plan mode (06.11), одобрен человеком без правок. Решения человека перед планом: security-guidance на T09 выключить, markdown — свой мини-разбор, бейдж только на колокольчике.

# План T09 «Уведомления и объявления»

## Контекст
В T08 сделан минимум: `/notifications` — простой список своих уведомлений (`repos/notifications.ts → notificationsOf`), `safeLink` для ссылок, уведомление при смене статуса заявки (`repos/staff-requests.ts → changeStatus`). Бейджа нет (`unreadCount = 0` с TODO в `(student)/layout.tsx` и `more/page.tsx`), у сотрудника только «Заявки».

T09 замыкает канал «деканат → студент»:
- вкладки и «прочитано»;
- колокольчик в мобильной шапке (внешняя оценка 06.11: сейчас до уведомлений 2 касания, станет 1);
- объявления от сотрудника адресатам;
- перенос пары с уведомлением группе.

Приёмка:
1. объявление для МЭО не видит Алиса (ФМО);
2. перенос пары появляется у группы в уведомлениях и на «Сейчас».

**Решения человека (06.11):**
- security-guidance на T09 выключаете вы (`false` в `.claude/settings.local.json`), до начала кода;
- markdown — свой мини-разбор без зависимостей;
- бейдж только на колокольчике (на «Ещё» его нет).

**Миграции не нужны:** все поля и индексы уже есть в схеме (`Notification.readAt` и индекс `[studentId, readAt]`, `Lesson.change/originalStartsAt/changeNote`, `Announcement.pinned`).

## Решения по умолчанию (поменяю, если скажете)
1. **Вкладка «Объявления» — доска объявлений.** Это таблица `Announcement` через готовый `announcementsFor(ctx)`: фильтр адресата уже в репозитории, закреплённые сверху, полный текст с markdown. Остальные вкладки фильтруют уведомления по `kind`. Уведомление-объявление ведёт на доску к нужному объявлению: `/notifications?tab=announcements#announcement-<id>`. Ссылка «Все объявления» с «Сейчас» — туда же.
2. **«Открыть уведомление» = отметить прочитанным.** Строка уведомления — это форма с Server Action:
   - `updateMany({ id, studentId: ctx.studentId, readAt: null })`;
   - затем `redirect(safeLink(link) ?? текущая вкладка)`.

   Работает без JS. Prefetch ничего не отмечает. Касание по всей строке — через `after:inset-0`. Почему не GET-ссылка: побочный эффект на GET сработал бы от prefetch.
3. **«Отметить всё прочитанным»** — outline-кнопка над списком, видна, только если есть непрочитанные. Заливных кнопок на экране нет.
4. **Бейдж в layout.** `optionalStudent()` в guards — вариант без редиректа: нет сессии или не студент → `null`. Это не проверка доступа, только число для оболочки. Защищает по-прежнему `requireStudent()` в каждой page. Действия «прочитано» и публикация делают `revalidatePath("/", "layout")`.
5. **Сотрудник адресует только свои факультеты.** Ирина не может написать «всем» и попасть к студентам МЖ.
   - `audience.facultyCodes` всегда заполнен (подмножество своих). Если ничего не выбрано — все свои.
   - Курсы и группы необязательны; группы — только своих факультетов.
   - Объявление сида `ann-1` для всех остаётся как «объявление деканата целиком».
6. **Перенос — только пары академической группы своего факультета.** Языковые группы смешаны по факультетам — их не трогаем.
   - Длительность пары сохраняется.
   - `originalStartsAt` — первое исходное время: повторный перенос не теряет «было 10:10».
   - Защита от двух сотрудников разом: `updateMany({ id, startsAt: ожидаемое, факультет })` с `count === 1`, иначе «Пару уже изменили — обновите страницу».
   - Ночной `db:reseed-schedule` возвращает расписание к сиду — для демо это нормально.

## Что делаю

### 1. Безопасный ввод и markdown — `src/lib/`
- **`links.ts`:**
  - `relativeLinkSchema` (zod, `/^\/(?![/\\])[^\s\\]*$/`, ≤ 300);
  - `safeLink` переезжает сюда, в `request-rules.ts` остаётся реэкспорт;
  - `assertLink()` для записи в БД — ею пользуются все места, где создаются `Notification` (статус заявки, объявление, перенос);
  - сид проверяет тест `seed-data.test.ts`: все `Notification.link` и `Deadline.link` проходят схему.
- **`markdown.ts` — чистая функция `parseMarkdown(text) → блоки`:**
  - абзацы, `- ` / `1. ` списки, `**жирный**`, `*курсив*`, `[текст](ссылка)`;
  - ссылка — только относительный путь или `https://`, иначе остаётся текстом;
  - `markdownToPlain()` — для тела уведомления и строки на «Сейчас».
- **`components/markdown.tsx`** — блоки → обычные React-элементы. Сырой HTML не вставляется нигде: тег из текста React покажет как текст. Внешняя ссылка — `rel="noopener noreferrer"` и скрытое «(внешняя ссылка)».

### 2. Данные — `src/server/repos/`
- **`notifications.ts`** (всё с `studentId: ctx.studentId`):
  - `notificationsOf(ctx, kind?)`;
  - `unreadCountOf(ctx)`;
  - `markRead(ctx, id)` → `link | null`;
  - `markAllRead(ctx)`.
- **`announcements.ts`** (сотрудник):
  - `staffAudienceOptions(ctx)` — свои факультеты, курсы, группы;
  - `myAnnouncements(ctx)`;
  - `publishAnnouncement(ctx, input)` — в одной транзакции:
    - `create`;
    - адресаты — запросом по `group.program.faculty.code ∈ facultyCodes ∩ свои`, `course`, `group.name`;
    - `notification.createMany` (тело — `markdownToPlain`, ≤ 200 символов).
  - `setPinned(ctx, id, pinned)` — `updateMany({ id, authorId: ctx.staffId })`.
- **`staff-schedule.ts`:**
  - `groupsForStaff(ctx)`;
  - `groupLessonsOn(ctx, groupId, day)` — группа только своих факультетов;
  - `rescheduleLesson(ctx, input)` — в транзакции: `updateMany` (см. п. 6) + `createMany` уведомлений студентам группы, `kind: SCHEDULE_CHANGE`.
    - Заголовок: «Перенос пары: <дисциплина>».
    - Тело: «пт, 7 нояб., 10:10 → 17:40, ауд. 305. Причина: …».
    - Ссылка: `/schedule?day=YYYY-MM-DD`.

### 3. Server Actions (guard первой строкой; zod; ID — только из ctx)
- **`actions/notifications.ts`:** `openNotificationAction`, `markAllReadAction`.
- **`actions/announcements.ts`:**
  - `publishAnnouncementAction`: заголовок 3–120, текст 1–4000, факультеты, курсы 1–6, группы, «Закрепить»;
  - `togglePinAction`.
- **`actions/schedule.ts`:** `rescheduleLessonAction`.
  - Поля: `lessonId`, ожидаемое `startsAt`, новая дата — от сегодня до +30 дней, время 08:00–21:00, аудитория — необязательно, причина 5–200.
  - Чужая или исчезнувшая пара → `notFound()`.

### 4. Студент
- **`/notifications`:**
  - вкладки «Все / Объявления / Дедлайны / Заявки / Расписание» — ссылками `?tab=` (zod, битое → «Все»), как вкладки очереди T08;
  - у каждой вкладки — число непрочитанных, у «Объявлений» — нет;
  - непрочитанное: точка `--brand` + полужирный заголовок + скрытое «Новое:» (не только цветом);
  - иконка вида: `Megaphone` / `CalendarClock` / `FileText` / `AlarmClock`;
  - пустое состояние своё на каждой вкладке; skeleton под вкладки и строки; `error.tsx`.
- **Шапка телефона:**
  - колокольчик `size-[44px]`, `aria-label` «Уведомления, 3 непрочитанных», бейдж `UnreadBadge`;
  - `aria-current` на `/notifications`;
  - у «Ещё» бейдж убираю (`MORE.badge` → false); в сайдбаре и на `/more` число берётся настоящее.
- **«Сейчас»:** текст объявления — `markdownToPlain`; ссылка «Все объявления» → `?tab=announcements`. Перенос уже виден в `ChangesBlock` и `NowCard` («было …»), если пара сегодня или завтра.

### 5. Сотрудник
- **`StaffNav`** (client, `usePathname`): Заявки, Объявления, Расписание. `aria-current` по пути вместо зашитого.
- **`/staff/announcements`:**
  - форма «Новое объявление»: подписи над полями, подсказка «Можно: **жирный**, *курсив*, списки, ссылки», факультеты и курсы — чекбоксами, группы — чекбоксами по факультету в `<details>`;
  - заливная кнопка «Опубликовать» (одна на экран);
  - успех — сообщение «Опубликовано: получили N студентов»;
  - ниже «Мои объявления»: кому, когда, «Закрепить / Открепить» (outline);
  - свой `loading.tsx`: id в адресе нет.
- **`/staff/schedule`:**
  - GET-форма «Группа + день»: работает без JS, по умолчанию первая группа и сегодня;
  - пары строками; у каждой — «Перенести» в `DialogForm`: дата, время начала, аудитория, причина → «Перенести пару»;
  - перенесённая пара показывает «было 10:10».

### 6. Сид
- Ссылки объявлений-уведомлений → `/notifications?tab=announcements#announcement-ann-N`.
- Добавлю Алисе одно непрочитанное объявление и одно прочитанное уведомление о заявке, чтобы вкладки и «Новое» были видны в демо.
- Сроки и даты — по правилам `06-seed-data.md`.

## Тесты
- **Юнит:**
  - `markdown.test.ts` — `<script>`, `<img onerror>`, `[x](javascript:…)`, `[x](//evil)`, вложенность, незакрытые `**`, `markdownToPlain`;
  - `links.test.ts`;
  - разбор `tab`;
  - zod-схемы переноса и объявления (границы);
  - `seed-data` — ссылки;
  - `guards.test.ts` — новые page и actions подхватит сам;
  - `nav-items` — без бейджа на «Ещё».
- **Интеграция** (`TEST_DATABASE_URL`):
  - адресаты `publishAnnouncement` = `matchesAudience` на всех студентах сида: МЭО → Тимур да, Алиса нет;
  - чужой факультет в `audience` отбрасывается;
  - `rescheduleLesson`: пара чужого факультета → `not_found`; повторный перенос сохраняет `originalStartsAt`; гонка → `conflict`;
  - `markRead` чужого уведомления → `count 0`.
- **e2e** (`--repeat-each=3`; всё, что тест создаёт, он и убирает: уборка по уникальному заголовку или id; пары восстанавливаем к исходным полям):
  - **`notifications.spec.ts`:**
    - на 360px колокольчик → `/notifications` за 1 касание, бейдж совпадает с числом новых;
    - вкладки фильтруют;
    - «Открыть» отмечает прочитанным;
    - «Отметить всё» на Вере: тест создаёт ей уведомления и убирает их — состояние демо Алисы не трогаем.
  - **`announcements.spec.ts` (приёмка 1):**
    - Ирина публикует объявление для МЭО и объявление для ФМО;
    - Тимур видит первое в уведомлениях и на доске;
    - Алиса видит своё ФМО (положительный контроль), а МЭО — нет;
    - `<script>` и `javascript:` из текста не исполняются и не попадают в `href`.
  - **`reschedule.spec.ts` (приёмка 2):** Ирина переносит завтрашнюю пару 2МО-3 → у Алисы уведомление и строка в «Изменениях» на «Сейчас» с «было …»; у Тимура уведомления нет.
  - **`security.spec.ts`:**
    - Алиса шлёт `openNotificationAction` с id уведомления Тимура → у Тимура `readAt` не изменился;
    - студент на `/staff/announcements` и `/staff/schedule` → редирект.
  - **`shell.spec.ts`:** цели касания колокольчика и строк, текст 200%.

## Проверка
- `pnpm format:check && pnpm lint && pnpm typecheck`
- `TEST_DATABASE_URL=… pnpm test`
- `node --test .claude/hooks/guard.test.mjs`
- `E2E_PORT=3105 pnpm test:e2e`, новые spec — `--repeat-each=3`
- Скриншоты: Node-скрипт на Chromium проекта, 360 и 1280, светлая и тёмная тема → `docs/process/screenshots/09-T09-*.png`.
- ux-reviewer → правки → `/log`, `ai-errors.md`, статус в `docs/tasks/README.md`, строки в `03-architecture.md` (маршруты) и `04-design.md` («Уведомления (T09)»).
- `pnpm dev` на :3000 — для вашей проверки с телефона.
- security-reviewer не запускаю: только по вашей просьбе.

## Критичные файлы
- `src/app/(student)/notifications/page.tsx`, `src/app/(student)/layout.tsx`, `src/app/(student)/more/page.tsx`
- `src/components/nav/nav-items.ts`, `src/components/nav/unread-badge.tsx`
- `src/app/(staff)/staff/layout.tsx`, новые `staff/announcements/`, `staff/schedule/`
- `src/server/repos/notifications.ts`, `announcements.ts`, новый `staff-schedule.ts`
- `src/server/auth/guards.ts` (`optionalStudent`)
- `src/server/services/request-rules.ts` (`safeLink` → `lib/links.ts`)
- `src/components/now/blocks.tsx`, `prisma/seed-data.ts`
