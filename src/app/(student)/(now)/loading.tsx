import { PageHeaderSkeleton, SkeletonCard, SkeletonList } from "@/components/skeletons";

// Загрузка «Сейчас»: та же сетка, что у ленты, — ничего не прыгает, когда данные приходят.
export default function Loading() {
  return (
    // Как PageSkeleton: role="status" + текст для скринридера (aria-label на div без роли запрещён — axe)
    <div
      role="status"
      className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start lg:gap-x-12 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]"
    >
      <span className="sr-only">Загружаем ваш день…</span>
      <PageHeaderSkeleton className="lg:col-span-2" />
      <div className="flex flex-col gap-8 lg:col-start-2 lg:row-span-3 lg:row-start-2">
        <SkeletonCard />
        <SkeletonList rows={2} />
      </div>
      <SkeletonList rows={2} />
      <SkeletonList rows={2} />
      <SkeletonList rows={1} />
    </div>
  );
}
