// Обязательная маркировка концепта (CLAUDE.md → «Маркировка концепта»).
// Текст не менять: его проверяют юнит- и e2e-тесты.
import { cn } from "@/lib/utils";

export const CONCEPT_NOTICE =
  "Концепт для конкурса. Не является официальным сервисом МГИМО. Все данные вымышлены.";

export function ConceptBanner({ className }: { className?: string }) {
  return (
    <p
      role="note"
      className={cn(
        "rounded-xl border border-line bg-brand-soft px-4 py-3 text-sm text-ink",
        className,
      )}
    >
      {CONCEPT_NOTICE}
    </p>
  );
}
