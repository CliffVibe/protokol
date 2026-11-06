// Подписи кабинета сотрудника — отдельно от request-rules: клиентскому компоненту не нужен zod в бандле.
import type { RequestStatus } from "@/generated/prisma/client";

/** Глагол на кнопке сотрудника — по целевому статусу. */
/** Статус для сотрудника: «Готова — заберите» — обращение к студенту, деканату нужно «к выдаче». */
export const STAFF_READY_LABEL = "Готова к выдаче";

export const ACTION_LABEL: Partial<Record<RequestStatus, string>> = {
  ACCEPTED: "Принять",
  IN_PROGRESS: "Взять в работу",
  READY: "Отметить готовой",
  ISSUED: "Выдать справку",
  REJECTED: "Отклонить",
};
