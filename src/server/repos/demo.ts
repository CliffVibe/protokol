import "server-only";
import { db } from "@/server/db";
import { requestHref } from "@/server/services/request-rules";

// Демо-стенд общий для всех экспертов жюри (T14, оценка «глазами жюри»). Одноразовые сценарии —
// «Деканат предлагает» и оценка заявки — после первого эксперта пропадали до ночного пересева.
// Поэтому при демо-входе студента они возвращаются: всё, что сделал прошлый посетитель больше
// RESTORE_AFTER_MS назад, откатывается. Свежее не трогаем — эксперт, который сам только что подал
// предложение, увидит свою заявку.
//
// Исключение из правила «каждая функция репозитория принимает ctx» (как repos/auth.ts): ctx ещё нет,
// функцию вызывает только services/auth.ts → authenticateDemo() при DEMO_MODE=1, после проверки
// логина по фиксированному списку DEMO_LOGINS. userId — из БД по этому логину, не из формы.

export const RESTORE_AFTER_MS = 15 * 60 * 1000;

/** Сид задаёт свои id (`rev-…`, `ntf-…`); всё, что создано на стенде, — с cuid Prisma. */
const SEED_EVENT = "rev-";
const SEED_NOTIFICATION = "ntf-";

/**
 * Демо-вход сотрудника: откатывает его же шаги по заявкам, сделанные на стенде больше 15 минут назад —
 * иначе «выдать пачкой» у следующего эксперта было пусто до ночного пересева (mobile-qa, T14).
 * Удаляются только события этого сотрудника не из сида; статус заявки — по последнему оставшемуся
 * событию; уведомления об откатанных шагах — тоже. Справка, выпущенная на стенде, уходит, если заявка
 * вернулась раньше «Готова». Объявления и ответы помощника не трогаем — их чистит ночной пересев.
 */
export async function restoreStaffDemo(userId: string, now = new Date()): Promise<void> {
  const before = new Date(now.getTime() - RESTORE_AFTER_MS);
  await db.$transaction(async (tx) => {
    const staff = await tx.staff.findUnique({ where: { userId }, select: { id: true } });
    if (!staff) return;
    const events = await tx.requestEvent.findMany({
      where: {
        actorUserId: userId,
        createdAt: { lt: before },
        NOT: { id: { startsWith: SEED_EVENT } },
      },
      select: { id: true, requestId: true },
    });
    if (events.length === 0) return;
    await tx.requestEvent.deleteMany({ where: { id: { in: events.map((e) => e.id) } } });

    for (const requestId of new Set(events.map((e) => e.requestId))) {
      const last = await tx.requestEvent.findFirst({
        where: { requestId },
        orderBy: { createdAt: "desc" },
        select: { status: true },
      });
      const request = await tx.request.findUnique({
        where: { id: requestId },
        select: { number: true },
      });
      if (!last || !request) continue;
      await tx.request.update({ where: { id: requestId }, data: { status: last.status } });
      if (last.status !== "READY" && last.status !== "ISSUED")
        await tx.issuedDocument.deleteMany({ where: { requestId } });
      await tx.notification.deleteMany({
        where: {
          link: requestHref(request.number),
          createdAt: { lt: before },
          NOT: { id: { startsWith: SEED_NOTIFICATION } },
        },
      });
    }
  });
}

export async function restoreDemoScenarios(userId: string, now = new Date()): Promise<void> {
  const before = new Date(now.getTime() - RESTORE_AFTER_MS);
  await db.$transaction(async (tx) => {
    const student = await tx.student.findUnique({ where: { userId }, select: { id: true } });
    if (!student) return;

    // Заявки, поданные из «Деканат предлагает», и справки, которые кабинет выдал сам (T14+, иначе у демо-
    // студента копились бы десятки справок и срабатывал лимит автовыдачи): удаляем вместе с уведомлениями.
    // У демо-студентов в сиде таких нет. У выданной справки IssuedDocument держит заявку (Restrict) — его первым.
    const offered = await tx.request.findMany({
      where: {
        studentId: student.id,
        OR: [{ offered: true }, { autoIssued: true }],
        createdAt: { lt: before },
      },
      select: { id: true, number: true },
    });
    if (offered.length > 0) {
      const ids = offered.map((r) => r.id);
      await tx.issuedDocument.deleteMany({ where: { requestId: { in: ids } } });
      await tx.notification.deleteMany({
        where: { studentId: student.id, link: { in: offered.map((r) => requestHref(r.number)) } },
      });
      await tx.request.deleteMany({ where: { id: { in: ids } } });
    }

    // «Не сейчас» по предложению — тоже назад
    await tx.offerDismissal.deleteMany({
      where: { studentId: student.id, createdAt: { lt: before } },
    });

    // Оценка заявки снова доступна
    await tx.request.updateMany({
      where: { studentId: student.id, ratedAt: { lt: before } },
      data: { rating: null, ratingComment: null, ratedAt: null },
    });
  });
}
