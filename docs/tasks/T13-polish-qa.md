# T13. Полировка и QA

## Сделать
- Подключить на время этапа chrome-devtools-mcp (команда в `docs/07-tooling.md`, раздел «Условно»), снять трейсы и Lighthouse главной, расписания и заявок на эмуляции мобильного. После этапа: `claude mcp remove chrome-devtools`.
- `/claude-security` → «Scan codebase» на medium; отчёт в `docs/process/security-scan-T13.md`; исправить подтверждённые находки.
- Скилл `web-interface-guidelines` по всем экранам.
- Прогнать `ux-reviewer` по каждому экрану, `mobile-qa` по всем 6 сценариям, `security-reviewer` по всему репо. Исправить находки; записать в `ai-errors.md` те, что были ошибками ИИ.
- Lighthouse (мобильный): Performance ≥ 85, Accessibility ≥ 95 на главной, расписании, заявках.
- Проверка на реальном телефоне (человек): iOS Safari + Android Chrome.
- Тёмная тема, крупный текст 200%, клавиатура.
- 404/500 страницы в стиле приложения.

## Приёмка
- [ ] Все e2e зелёные в обоих проектах
- [ ] Отчёты субагентов и Lighthouse — в `docs/process/`
