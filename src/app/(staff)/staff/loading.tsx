import { PageSkeleton } from "@/components/skeletons";

// Общий skeleton кабинета сотрудника; очередь заявок (T08) заведёт свой под таблицу.
export default function Loading() {
  return <PageSkeleton />;
}
