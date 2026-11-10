import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

export type StaffIdentityData = { fullName: string; facultyCodes: string[] };

/** «ФМО и МЭО», «ФМО, МЭО и МЖ». */
export function facultyList(codes: string[]): string {
  if (codes.length <= 1) return codes.join("");
  return `${codes.slice(0, -1).join(", ")} и ${codes[codes.length - 1]}`;
}

/**
 * Кто вошёл в кабинет сотрудника (T13, замечание человека: «нигде не написано, что это аккаунт Ирины и она
 * сотрудник деканата»). В шапке на ≥ 1024 — компактно справа; на телефоне — в блоке «Профиль» внизу.
 */
export function StaffIdentity({ who, className }: { who: StaffIdentityData; className?: string }) {
  return (
    <p className={cn("flex min-w-0 items-start gap-2 text-ink", className)}>
      <UserRound aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold break-words">{who.fullName}</span>
        <span className="text-xs break-words text-ink-muted">
          Сотрудник деканата {facultyList(who.facultyCodes)}
        </span>
      </span>
    </p>
  );
}
