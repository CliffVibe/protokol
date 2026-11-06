import { QueueSkeleton } from "@/components/skeletons";

// Skeleton только у очереди: она в группе (queue), чтобы не оборачивать карточку заявки —
// иначе чужой факультет получал бы HTTP 200 вместо 404 (как у студента, S1).
export default function Loading() {
  return <QueueSkeleton />;
}
