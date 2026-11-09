import type { Page } from "@playwright/test";

/**
 * Крупный текст («200%» и т. п.): размер корня + ждём шрифты и две перерисовки (T13, ревью T07–T08).
 * Без ожидания ширину иногда мерили до загрузки PT Sans/PT Serif — запасной шрифт уже, и проверка
 * «нет скролла вбок» то проходила, то нет. Если 200% снова «поплывёт» — сначала искать данные
 * (длинное слово без break-words, как NowCard в T09), а уже потом шрифты.
 */
export async function setTextScale(page: Page, scale: string): Promise<void> {
  await page.evaluate(async (s) => {
    document.documentElement.style.fontSize = s;
    await document.fonts.ready;
    await new Promise<void>((done) =>
      requestAnimationFrame(() => requestAnimationFrame(() => done())),
    );
  }, scale);
}
