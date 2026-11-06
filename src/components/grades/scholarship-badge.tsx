import { ShieldAlert, ShieldCheck } from "lucide-react";
import { StatusChip } from "@/components/status-chip";
import type { Scholarship } from "@/server/services/academics";

/**
 * «Стипендия сохраняется» / «Стипендия под угрозой» + причины списком (04-design → ScholarshipBadge).
 * Один вид на «Сейчас» и в «Успеваемости». Правило — вымышленное (docs/01-concept.md).
 */
export function ScholarshipBadge({ scholarship }: { scholarship: Scholarship }) {
  if (scholarship.kept)
    return (
      <StatusChip tone="ok" icon={ShieldCheck} className="self-start">
        Стипендия сохраняется
      </StatusChip>
    );
  return (
    <div className="flex flex-col gap-1.5">
      <StatusChip tone="warn" icon={ShieldAlert} className="self-start">
        Стипендия под угрозой
      </StatusChip>
      <ul aria-label="Причины" className="list-disc pl-5 text-sm text-ink">
        {scholarship.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </div>
  );
}
