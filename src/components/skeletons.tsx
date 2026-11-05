// Набор skeleton тех же размеров, что контент (04-design → «Состояния»). Для loading.tsx.
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function PageHeaderSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* высота строки text-h1 / text-display */}
      <Skeleton className="h-[2.1rem] w-48 lg:h-[2.6rem] lg:w-64" />
      <Skeleton className="h-5 w-72 max-w-full" />
    </div>
  );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-4", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn("flex flex-col gap-3 rounded-xl border border-line bg-surface p-4", className)}
    >
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-7 w-20 rounded-full" />
      </div>
      <Skeleton className="h-5 w-3/4" />
      <SkeletonText lines={2} />
    </div>
  );
}

export function SkeletonList({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col divide-y divide-line rounded-xl border border-line bg-surface",
        className,
      )}
    >
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex min-h-16 items-center gap-3 px-4 py-3">
          <Skeleton className="h-5 w-12" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Скелет типового экрана: заголовок + карточка + список. Подпись — для скринридера. */
export function PageSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Загружаем…</span>
      <PageHeaderSkeleton />
      <SkeletonCard />
      <SkeletonList />
    </div>
  );
}
