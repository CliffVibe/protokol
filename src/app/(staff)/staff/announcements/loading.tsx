import { StaffFormSkeleton } from "@/components/skeletons";

// Адрес без id — skeleton безопасен (чужой id получил бы 200 вместо 404 только у страниц с id, T07).
export default function Loading() {
  return <StaffFormSkeleton label="Загружаем объявления…" />;
}
