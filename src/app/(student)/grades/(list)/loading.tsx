import { GradesSkeleton } from "@/components/skeletons";

// Skeleton только у списка: он в группе (list), чтобы не оборачивать детали дисциплины.
// Иначе ответ /grades/[id] начинал бы стримиться до проверки владельца, и чужой id получал бы
// HTTP 200 вместо 404 (node_modules/next/dist/docs → loading.md, «Status codes»; S1).
export default function Loading() {
  return <GradesSkeleton />;
}
