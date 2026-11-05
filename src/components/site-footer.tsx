import { ConceptBanner } from "@/components/concept-banner";
import { cn } from "@/lib/utils";

// Футер с обязательной плашкой концепта (CLAUDE.md → «Маркировка концепта»).
// Вставляется в каждую оболочку: студента, сотрудника, витрину; страница входа ставит плашку сама.
export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("mx-auto w-full max-w-[1120px] px-4 pt-8 pb-6 md:px-6", className)}>
      <ConceptBanner />
    </footer>
  );
}
