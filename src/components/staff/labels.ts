// Подписи кабинета сотрудника — отдельно от request-rules: клиентскому компоненту не нужен zod в бандле.
import type { RequestStatus } from "@/generated/prisma/client";

/** Глагол на кнопке сотрудника — по целевому статусу. */
export const ACTION_LABEL: Partial<Record<RequestStatus, string>> = {
  ACCEPTED: "Принять",
  IN_PROGRESS: "Взять в работу",
  READY: "Готова",
  ISSUED: "Выдана",
  REJECTED: "Отклонить",
};
