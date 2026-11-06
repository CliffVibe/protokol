// Ссылки, которые пишем в БД и выводим в href (уведомления, дедлайны, объявления) — T09.
// Только относительный путь внутри сайта: `javascript:`, `//evil`, `/\evil` (браузер читает как //)
// не попадут ни в базу, ни в разметку (из security-ревью T02).
import { z } from "zod";

const RELATIVE = /^\/(?![/\\])[^\s\\]*$/;

/** zod-схема ссылки для записи в БД: путь от корня сайта, ≤ 300 символов. */
export const relativeLinkSchema = z.string().max(300).regex(RELATIVE);

/** Ссылка перед выводом в href: только относительный путь; иначе null (не показываем ссылку). */
export function safeLink(link: string | null | undefined): string | null {
  if (!link) return null;
  return relativeLinkSchema.safeParse(link).success ? link : null;
}

/** Ссылка перед записью в БД: битая — ошибка программиста, а не тихая запись (S5). */
export function assertLink(link: string): string {
  return relativeLinkSchema.parse(link);
}

/** Внешняя ссылка в тексте объявления: только https и без учётных данных в адресе. */
export function safeExternalLink(link: string): string | null {
  if (link.length > 500 || /\s/.test(link)) return null;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  return url.href;
}
