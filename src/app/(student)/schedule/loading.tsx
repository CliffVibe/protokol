import { ScheduleSkeleton } from "@/components/skeletons";

// Загрузка расписания: та же раскладка, что у дня и недели, — строки пар той же высоты.
export default function Loading() {
  return <ScheduleSkeleton />;
}
