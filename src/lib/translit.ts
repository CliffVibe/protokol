// Транслитерация кириллицы латиницей по ICAO Doc 9303 — как в российском загранпаспорте с 2014 года
// (Петрова → Petrova, Юлия → Iuliia, Щукин → Shchukin). Нужна английской справке для визы (T10):
// имя в справке совпадает с паспортным написанием. Чистая функция, тест — tests/unit/translit.test.ts.

const MAP: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "ie",
  ы: "y",
  ь: "",
  э: "e",
  ю: "iu",
  я: "ia",
};

/** Транслитерация с сохранением регистра первой буквы каждого слова; не кириллица — как есть. */
export function translitIcao(text: string): string {
  let out = "";
  for (const ch of text) {
    const lower = ch.toLowerCase();
    const latin = MAP[lower];
    if (latin === undefined) {
      out += ch;
      continue;
    }
    out += ch !== lower && latin ? latin[0]!.toUpperCase() + latin.slice(1) : latin;
  }
  return out;
}
