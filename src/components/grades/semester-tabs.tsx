// Переключатель семестров: ссылки (адрес можно переслать, работает без JS), активный — чернильная черта
// и полужирный, как «День / Неделя». Текущий семестр — просто /grades.
import Link from "next/link";
import type { Route } from "next";
import { cn } from "@/lib/utils";

export const semesterHref = (semester: number, current: number) =>
  (semester === current ? "/grades" : `/grades?semester=${semester}`) as Route;

export function SemesterTabs({
  semesters,
  selected,
  current,
}: {
  semesters: number[];
  selected: number;
  current: number;
}) {
  return (
    <nav aria-label="Семестры">
      <ul className="flex flex-wrap gap-x-6 border-b border-line">
        {semesters.map((s) => {
          const active = s === selected;
          return (
            <li key={s}>
              <Link
                href={semesterHref(s, current)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex min-h-11 items-center border-b-2 text-base",
                  active
                    ? "border-brand font-bold text-ink"
                    : "border-transparent text-ink-muted hover:text-ink",
                )}
              >
                {s}-й семестр
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
