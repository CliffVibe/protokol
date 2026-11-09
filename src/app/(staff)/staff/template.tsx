// Мягкое появление страницы при смене раздела (решение человека 10.11: «плавно и аккуратно»).
// template, а не layout: монтируется заново при переходе в другой раздел; внутри раздела и при смене
// ?day= / ?tab= — нет (docs Next 16 → template.md), поэтому анимация не мелькает на каждом клике.
// Только прозрачность и сдвиг на 6px за 180 мс; prefers-reduced-motion гасит (globals.css).
// Это не проверка доступа — её делает каждая page (CLAUDE.md → «Железные правила»).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="motion-safe:animate-page-in">{children}</div>;
}
