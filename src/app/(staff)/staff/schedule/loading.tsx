import { StaffFormSkeleton } from "@/components/skeletons";

// Адрес без id (группа и день — в query, проверяются в page) — skeleton безопасен.
export default function Loading() {
  return <StaffFormSkeleton label="Загружаем расписание группы…" />;
}
