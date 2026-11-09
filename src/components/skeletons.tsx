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

/** Ближайшая пара: плашка Б′ (T13) — те же радиус, отступы и строки, что у NowCard, чтобы не прыгало. */
export function NowCardSkeleton({ className }: { className?: string }) {
  const bar = "bg-on-plate/20";
  return (
    <div className={cn("flex flex-col gap-3 rounded-[1.75rem] bg-plate p-5 md:p-6", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className={cn("h-4 w-28 max-w-full", bar)} />
        <Skeleton className={cn("h-7 w-24 max-w-full rounded-full", bar)} />
      </div>
      <Skeleton className={cn("mt-2 h-[3.25rem] w-48 max-w-full", bar)} />
      <Skeleton className={cn("h-7 w-2/3", bar)} />
      <Skeleton className={cn("h-4 w-24 max-w-full", bar)} />
      <Skeleton className={cn("h-5 w-3/4", bar)} />
      <Skeleton className={cn("h-5 w-1/2", bar)} />
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

/** Строки заявок — той же высоты, что RequestRow (название, номер, чип со сроком). */
function RequestRowsSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col divide-y divide-line border-y border-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5 py-4">
          <Skeleton className="h-5 w-3/4 max-w-full" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-7 w-40 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** «Заявки» (T08): заголовок с кнопкой, «Активные» и «Архив». */
export function RequestsSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-8 lg:max-w-3xl">
      <span className="sr-only">Загружаем заявки…</span>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Skeleton className="h-[2.1rem] w-40 lg:h-[2.6rem]" />
        <Skeleton className="h-12 w-48 rounded-lg" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-32" />
        <RequestRowsSkeleton rows={2} />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-24" />
        <RequestRowsSkeleton rows={1} />
      </div>
    </div>
  );
}

/** Очередь заявок сотрудника (T08): заголовок, фильтры, строки. */
export function QueueSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Загружаем очередь заявок…</span>
      <PageHeaderSkeleton />
      <div className="flex flex-wrap gap-x-6 border-b border-line">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="my-3 h-5 w-24" />
        ))}
      </div>
      {/* Фильтры: факультет, тип, «Показать» — та же высота, ничего не прыгает */}
      <div className="flex flex-wrap items-end gap-3">
        <Skeleton className="h-[4.25rem] w-56 max-w-full" />
        <Skeleton className="h-[4.25rem] w-64 max-w-full flex-1" />
        <Skeleton className="h-11 w-28 rounded-lg" />
      </div>
      <RequestRowsSkeleton rows={5} />
    </div>
  );
}

/** «Уведомления» (T09): заголовок, вкладки, строки с иконкой. */
export function NotificationsSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-6 lg:max-w-3xl">
      <span className="sr-only">Загружаем уведомления…</span>
      <PageHeaderSkeleton />
      <div className="flex flex-wrap gap-x-6 border-b border-line">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="my-3 h-5 w-20" />
        ))}
      </div>
      <ul className="flex flex-col divide-y divide-line border-y border-line">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className="flex gap-3 py-4">
            <Skeleton className="size-6 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-4 w-28" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Экраны сотрудника с формой и списком (T09: объявления, расписание групп). */
export function StaffFormSkeleton({ label }: { label: string }) {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">{label}</span>
      <PageHeaderSkeleton />
      <div className="flex flex-col gap-4 lg:max-w-2xl">
        <Skeleton className="h-[4.25rem] w-full" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-12 w-40 rounded-lg" />
      </div>
      <SkeletonList rows={3} />
    </div>
  );
}
