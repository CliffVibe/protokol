import { PageHeaderSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

// Skeleton помощника (T12) — тех же размеров, что экран: шапка, сноска, чипы, поле вопроса.
// В адресе нет id, поэтому loading.tsx здесь безопасен (404 после начала стрима не грозит).
export default function Loading() {
  return (
    <div className="flex max-w-3xl flex-col gap-6" aria-busy="true" aria-label="Загрузка помощника">
      <PageHeaderSkeleton />
      <Skeleton className="h-10 w-full max-w-xl" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-40" />
        <div className="flex flex-wrap gap-2">
          {/* Классы целиком: Tailwind не видит собранные из кусков имена */}
          {["w-48", "w-44", "w-44", "w-48", "w-36"].map((w, i) => (
            <Skeleton key={i} className={`h-11 rounded-full ${w}`} />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-[72px] w-full rounded-lg" />
        <Skeleton className="h-11 w-full rounded-lg sm:w-32" />
      </div>
    </div>
  );
}
