import { ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { StatusChip } from "@/components/status-chip";
import { DEBT_REASON_PREFIX, scholarshipTitle } from "@/lib/scholarship";
import type { Scholarship } from "@/server/services/academics";

/**
 * «Стипендия сохраняется» / «под угрозой» / «не назначена» + причины списком (04-design → ScholarshipBadge).
 * Один вид на «Сейчас» и в «Успеваемости». Правило — вымышленное (docs/01-concept.md).
 * debtsShownAbove — долги уже названы на экране выше («Учёба»): в причинах не повторяем их по именам
 * (оценка «глазами жюри», T14: «долг назван трижды на одном экране»).
 */
export function ScholarshipBadge({
  scholarship,
  debtsShownAbove = false,
}: {
  scholarship: Scholarship;
  debtsShownAbove?: boolean;
}) {
  if (scholarship.kept)
    return (
      <StatusChip tone="ok" icon={ShieldCheck} className="self-start">
        {scholarshipTitle(scholarship)}
      </StatusChip>
    );
  const debtReasons = scholarship.reasons.filter((r) => r.startsWith(DEBT_REASON_PREFIX));
  const reasons =
    debtsShownAbove && debtReasons.length > 0
      ? [
          "Есть долг — стипендию назначат после пересдачи",
          ...scholarship.reasons.filter((r) => !r.startsWith(DEBT_REASON_PREFIX)),
        ]
      : scholarship.reasons;
  return (
    <div className="flex flex-col gap-1.5">
      <StatusChip
        tone={scholarship.lost ? "danger" : "warn"}
        icon={scholarship.lost ? ShieldX : ShieldAlert}
        className="self-start"
      >
        {scholarshipTitle(scholarship)}
      </StatusChip>
      <ul aria-label="Причины" className="list-disc pl-5 text-sm text-ink">
        {reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </div>
  );
}
