import { PageHeaderSkeleton, SkeletonList } from "@/components/skeletons";

// Шаги мастера «Зачем нужна справка?» (T10): между касаниями — skeleton, а не «мёртвый» экран.
// Здесь можно: в адресе нет номера заявки — нечему отдавать 404 после начала стрима.
export default function Loading() {
  return (
    <div className="flex flex-col gap-6 lg:max-w-3xl" aria-busy="true">
      <PageHeaderSkeleton />
      <SkeletonList rows={4} />
    </div>
  );
}
