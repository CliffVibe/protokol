import { SCHOLARSHIP_MIN_RATING } from "@/lib/scholarship";

// Средний рейтинг по семестрам (T14, оценка «глазами жюри»: «интерфейс почти целиком текстовый, нет
// ни одного графика динамики»). Один ряд — без легенды, его называет заголовок (dataviz: single series).
// Серверный SVG без библиотек и без style={{}} (CSP): размеры — атрибутами, цвета — токенами Б′
// (fill-brand, stroke-line, text-ink-muted), обе темы — сами. Значения подписаны у каждого столбца
// (их до 8), порог стипендии — пунктиром. Наведение — <title> на всю колонку (цель больше столбца),
// читалке — таблица.

export type TrendPoint = { semester: number; average: number };

const W = 320;
const H = 152;
const TOP = 22; // место под подпись значения
const BOTTOM = 26; // место под подпись семестра
const PLOT = H - TOP - BOTTOM;
const y = (v: number) => TOP + PLOT * (1 - v / 100);

export function RatingTrend({ points, current }: { points: TrendPoint[]; current: number }) {
  if (points.length < 2) return null;
  const n = points.length;
  const slot = W / n;
  const bar = Math.min(36, slot * 0.56);
  const threshold = y(SCHOLARSHIP_MIN_RATING);
  return (
    <section
      aria-labelledby="trend-title"
      className="flex flex-col gap-2 border-t border-line pt-4"
    >
      <h2 id="trend-title" className="font-heading text-lg font-semibold text-ink">
        Средний рейтинг по семестрам
      </h2>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full max-w-md text-ink-muted"
        role="img"
        aria-labelledby="trend-title trend-desc"
      >
        <desc id="trend-desc">
          {points.map((p) => `${p.semester}-й семестр — ${p.average}`).join(", ")}. Порог стипендии
          — {SCHOLARSHIP_MIN_RATING}.
        </desc>
        {/* Базовая линия и порог стипендии — тихие, данные громче */}
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="stroke-line" strokeWidth={1} />
        <line
          x1={0}
          x2={W}
          y1={threshold}
          y2={threshold}
          className="stroke-current"
          strokeWidth={1}
          strokeDasharray="3 4"
          opacity={0.7}
        />
        {/* Подпись порога — под графиком, а не на линии: рядом с 58–66 она наезжала на значения */}
        {points.map((p, i) => {
          const cx = slot * i + slot / 2;
          const top = y(p.average);
          const isCurrent = p.semester === current;
          return (
            <g key={p.semester}>
              <title>
                {`${p.semester}-й семестр${isCurrent ? " (текущий, рейтинг в процессе)" : ""}: ${p.average} из 100`}
              </title>
              {/* Невидимая цель наведения на всю колонку */}
              <rect x={slot * i} y={TOP} width={slot} height={PLOT} fill="transparent" />
              {/* Столбец со скруглённым верхом у данных и прямым низом у базовой линии; текущий — светлее:
                  рейтинг ещё набирается */}
              <path
                d={`M${cx - bar / 2},${y(0)} V${top + 4} q0,-4 4,-4 H${cx + bar / 2 - 4} q4,0 4,4 V${y(0)} Z`}
                className="fill-brand"
                opacity={isCurrent ? 0.45 : 1}
              />
              <text
                x={cx}
                y={top - 6}
                textAnchor="middle"
                className="fill-ink tabular"
                fontSize={12}
                fontWeight={700}
              >
                {p.average}
              </text>
              <text x={cx} y={H - 8} textAnchor="middle" className="fill-current" fontSize={11}>
                {isCurrent ? `${p.semester} · сейчас` : `${p.semester} сем.`}
              </text>
            </g>
          );
        })}
      </svg>
      <p aria-hidden className="flex items-center gap-2 text-sm text-ink-muted">
        <svg viewBox="0 0 24 4" className="h-1 w-6 shrink-0 text-ink-muted">
          <line x1={0} x2={24} y1={2} y2={2} className="stroke-current" strokeDasharray="3 4" />
        </svg>
        {SCHOLARSHIP_MIN_RATING} — порог стипендии; бледный столбец — текущий семестр, рейтинг
        набирается
      </p>
      {/* Таблица — для читалки. sr-only на обёртке, а не на <table>: у таблицы width 1px не действует,
          и при тексте 200% она растягивала страницу вбок (e2e, 12.11) */}
      <div className="sr-only">
        <table>
          <caption>Средний рейтинг по семестрам, из 100</caption>
          <thead>
            <tr>
              <th scope="col">Семестр</th>
              <th scope="col">Средний рейтинг</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.semester}>
                <th scope="row">
                  {p.semester}-й{p.semester === current ? " (текущий)" : ""}
                </th>
                <td>{p.average}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
