import "server-only";
import { holderInitials } from "@/lib/initials";
import { db } from "@/server/db";

// Публичная проверка справки по QR (T10, S7) — исключение из правила «каждая функция репозитория
// получает ctx»: проверяющий (посольство, работодатель) не входит в систему. Доступ даёт сам токен —
// 128 бит случайности (repos/staff-requests.changeStatus), перебором не найти.
// Наружу — только статус, тип, дата выдачи, срок действия и инициалы. Полное ФИО собирается
// в инициалы ЗДЕСЬ и из функции не выходит; номера зачётки, оценок, причины отзыва в выборке нет вовсе.

export type VerifyState = "valid" | "revoked" | "expired";

export type VerifiedDocument = {
  state: VerifyState;
  typeCode: string;
  typeTitle: string;
  language: string;
  issuedAt: Date;
  /** «Действует до» — решение человека 07.11 (S7): проверяющему нужен срок, это не персональные данные */
  validUntil: Date | null;
  holder: string;
};

export async function documentByToken(token: string, now: Date): Promise<VerifiedDocument | null> {
  const d = await db.issuedDocument.findUnique({
    where: { verifyToken: token },
    select: {
      revoked: true,
      issuedAt: true,
      validUntil: true,
      request: {
        select: {
          language: true,
          type: { select: { code: true, title: true } },
          student: { select: { lastName: true, firstName: true, middleName: true } },
        },
      },
    },
  });
  if (!d) return null;
  const { request: r } = d;
  return {
    state: d.revoked ? "revoked" : d.validUntil && d.validUntil < now ? "expired" : "valid",
    typeCode: r.type.code,
    typeTitle: r.type.title,
    language: r.language,
    issuedAt: d.issuedAt,
    validUntil: d.validUntil,
    holder: holderInitials(r.student, r.language === "en"),
  };
}
