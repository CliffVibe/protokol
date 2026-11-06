// Набор skeleton тех же размеров, что контент (04-design → «Состояния»). Для loading.tsx.
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function PageHeaderSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* высота строки text-2xl / text-3xl */}
      <Skeleton className="h-[2.1rem] w-48 max-w-full lg:h-[2.6rem] lg:w-64" />
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

/**
 * Блок ленты «Сейчас»: заголовок и строки под тонкими линиями — без рамки и фона, как сама лента
 * (ux-reviewer, T05: одинаковые карточки-заглушки прыгали и спорили с 04-design).
 */
export function FeedSectionSkeleton({
  rows = 2,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex min-h-11 items-center justify-between gap-4">
        <Skeleton className="h-6 w-36 max-w-full" />
        <Skeleton className="h-4 w-20 max-w-full" />
      </div>
      <div className="flex flex-col divide-y divide-line border-y border-line">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex flex-col gap-2 py-3">
            <Skeleton className="h-7 w-32 max-w-full rounded-full" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Ближайшая пара: карточка с крупным временем — по высоте как NowCard. */
export function NowCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 md:p-5",
        className,
      )}
    >
      <Skeleton className="h-4 w-28 max-w-full" />
      <Skeleton className="h-10 w-48 max-w-full" />
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-4 w-24 max-w-full" />
      <SkeletonText lines={2} />
      <Skeleton className="h-4 w-28 max-w-full" />
    </div>
  );
}

/**
 * Расписание (T06): заголовок, переключатель, полоса недели и два дня строками той же высоты,
 * что LessonRow (время столбцом слева, три строки текста справа) — ничего не прыгает.
 */
export function ScheduleSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Загружаем расписание…</span>
      <PageHeaderSkeleton />
      <div className="flex gap-6 border-b border-line">
        <Skeleton className="my-3 h-5 w-20" />
        <Skeleton className="my-3 h-5 w-16" />
      </div>
      <div className="flex flex-col gap-8">
        {[3, 2].map((rows, d) => (
          <div key={d} className="flex flex-col gap-2">
            <Skeleton className="h-7 w-56 max-w-full" />
            <div className="flex flex-col divide-y divide-line border-y border-line">
              {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="flex gap-4 py-3">
                  <div className="flex w-[4.5rem] shrink-0 flex-col gap-1.5">
                    <Skeleton className="h-6 w-14" />
                    <Skeleton className="h-4 w-10" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Строки дисциплин — той же высоты, что DisciplineRow (название, тип, бар с числом, чип). */
function DisciplineRowsSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col divide-y divide-line border-y border-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 py-4">
          <Skeleton className="h-5 w-3/4 max-w-full" />
          <Skeleton className="h-4 w-1/2" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-2.5 flex-1" />
            <Skeleton className="h-6 w-14" />
          </div>
          <Skeleton className="h-7 w-28 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** «Учёба» (T07): заголовок, сводка «Как у меня дела», семестры, строки дисциплин — та же сетка. */
export function GradesSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Загружаем успеваемость…</span>
      <PageHeaderSkeleton />
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start lg:gap-x-12">
        <div className="flex flex-col gap-3 lg:col-start-2 lg:row-start-1">
          <Skeleton className="h-7 w-48 max-w-full" />
          <div className="flex flex-col gap-4 border-t border-line pt-3">
            <Skeleton className="h-8 w-64 max-w-full" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-7 w-52 max-w-full rounded-full" />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-1">
          <div className="flex gap-6 border-b border-line">
            <Skeleton className="my-3 h-5 w-24" />
            <Skeleton className="my-3 h-5 w-24" />
          </div>
          <Skeleton className="h-7 w-56 max-w-full" />
          <DisciplineRowsSkeleton rows={4} />
        </div>
      </div>
    </div>
  );
}
