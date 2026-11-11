import { StaffFormSkeleton } from "@/components/skeletons";

// Адрес без id — skeleton безопасен. Лежит в группе (list): иначе он оборачивал бы и /staff/answers/[id] —
// стрим начинался до проверки, и чужой или битый id получал 200 вместо 404 (поймал e2e, T14+).
export default function Loading() {
  return <StaffFormSkeleton label="Загружаем базу ответов…" />;
}
