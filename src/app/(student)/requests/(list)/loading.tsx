import { RequestsSkeleton } from "@/components/skeletons";

// Skeleton только у списка: он в группе (list), чтобы не оборачивать заявку /requests/[number].
// Иначе ответ начинал бы стримиться до проверки владельца, и чужой номер получал бы HTTP 200
// вместо 404 (как в T07, S1).
export default function Loading() {
  return <RequestsSkeleton />;
}
