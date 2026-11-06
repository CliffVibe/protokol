import { PageSkeleton } from "@/components/skeletons";

// Общий skeleton раздела, пока у него нет своего (заводят T06–T12 под точные размеры).
// Лежит в разделе, а не в (student)/loading.tsx: тот мелькал бы перед skeleton «Сейчас» (ux-reviewer, T05).
export default function Loading() {
  return <PageSkeleton />;
}
