import { PageSkeleton } from "@/components/skeletons";

// Общий skeleton разделов студента. Разделы с данными (T05–T12) заводят свой loading.tsx
// под точные размеры контента.
export default function Loading() {
  return <PageSkeleton />;
}
