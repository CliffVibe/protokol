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

export async function restoreDemoScenarios(userId: string, now = new Date()): Promise<void> {
  const before = new Date(now.getTime() - RESTORE_AFTER_MS);
  await db.$transaction(async (tx) => {
    const student = await tx.student.findUnique({ where: { userId }, select: { id: true } });
    if (!student) return;

    // Заявки, поданные из «Деканат предлагает»: удаляем вместе с уведомлениями о них.
    // У выданной справки IssuedDocument держит заявку (onDelete: Restrict) — его первым.
    const offered = await tx.request.findMany({
      where: { studentId: student.id, offered: true, createdAt: { lt: before } },
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
