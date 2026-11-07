# База ответов помощника (T12)

Вымышленные статьи для концепта: правила и сроки придуманы, это не регламенты МГИМО.
Без реальных ФИО, телефонов, номеров приказов и кабинетов.

Формат статьи — frontmatter из трёх строк и текст в markdown:

```
---
title: Заголовок вопроса
keywords: слово, другое слово, фраза
actions: request_military, requests
---
```

`actions` — только id из `src/lib/assistant-actions.ts` (неизвестный id не пропустит тест `tests/unit/assistant-faq.test.ts`).
