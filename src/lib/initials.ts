import { translitIcao } from "./translit";

// Инициалы для публичной проверки справки (S7): «Петрова А. С.» — фамилия и первые буквы имени и
// отчества. Для справки на английском — латиницей по ICAO («Petrova A. S.»), как в самой справке.
export function holderInitials(
  name: { lastName: string; firstName: string; middleName: string | null },
  latin = false,
): string {
  const tr = (s: string) => (latin ? translitIcao(s) : s);
  const initial = (s: string | null) => {
    const first = s?.trim()[0];
    return first ? `${tr(first)[0]!.toUpperCase()}.` : null;
  };
  return [tr(name.lastName.trim()), initial(name.firstName), initial(name.middleName)]
    .filter(Boolean)
    .join(" ");
}
