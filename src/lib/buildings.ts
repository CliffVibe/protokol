// Время в дороге между корпусами — для строки «переход в другой корпус» в расписании (T14, оценка
// «глазами жюри»: «Перерыв 20 мин — Главный корпус → Одинцово» выглядел так, будто успеть можно).
// Значения — ориентир для демо, округлённо: общественный транспорт без пробок. Пары корпусов, которых
// нет в таблице, — время не пишем (не выдумываем).

const MAIN = "Главный корпус (пр-т Вернадского)";
const ODINTSOVO = "Одинцово";

const TRAVEL: Record<string, number> = {
  [`${MAIN}|${ODINTSOVO}`]: 60,
};

/** Минуты в дороге между корпусами, если известны (в обе стороны одинаково). */
export function travelMinutes(from: string, to: string): number | null {
  return TRAVEL[`${from}|${to}`] ?? TRAVEL[`${to}|${from}`] ?? null;
}

/** «40 мин», «1 ч», «2 ч 20 мин». */
export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} мин`;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}
