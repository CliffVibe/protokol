import { NotificationsSkeleton } from "@/components/skeletons";

// Skeleton под вкладки и строки уведомлений (T09). Адрес без id — skeleton безопасен (см. T07: 404 до стрима).
export default function Loading() {
  return <NotificationsSkeleton />;
}
