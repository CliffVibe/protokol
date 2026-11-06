"use client";

// «Перенести пару» (T09): нативный <dialog> через DialogForm (Radix вставлял бы <style> без nonce — прод-CSP).
// Новая дата и время, аудитория (необязательно), причина — её увидят студенты. Длительность пары сохраняется.
import { DialogForm, TextArea } from "@/components/dialog-form";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { rescheduleLessonAction, type RescheduleState } from "@/server/actions/staff-schedule";

export function RescheduleDialog({
  lessonId,
  startsAt,
  title,
  defaultDate,
  defaultTime,
  room,
  minDate,
  maxDate,
}: {
  lessonId: string;
  /** ISO: какое время видел сотрудник (защита от двух переносов разом) */
  startsAt: string;
  /** «Эконометрика, 10:10» — для имени кнопки и заголовка */
  title: string;
  defaultDate: string;
  defaultTime: string;
  room: string;
  minDate: string;
  maxDate: string;
}) {
  return (
    <DialogForm<RescheduleState>
      triggerLabel="Перенести"
      triggerAriaLabel={`Перенести: ${title}`}
      dialogId={`reschedule-${lessonId}`}
      title={`Перенести пару: ${title}`}
      description="Студенты группы получат уведомление, на их главной появится «было …»."
      confirmLabel="Перенести пару"
      action={rescheduleLessonAction}
      hidden={{ lessonId, expectedStartsAt: startsAt }}
    >
      {(state) => {
        const e = state.fieldErrors ?? {};
        return (
          <>
            <div className="flex flex-wrap gap-3">
              <FormField
                id={`d-${lessonId}`}
                label="Дата"
                error={e.date}
                className="min-w-40 flex-1"
              >
                {(control) => (
                  <Input
                    {...control}
                    type="date"
                    name="date"
                    defaultValue={defaultDate}
                    min={minDate}
                    max={maxDate}
                    required
                  />
                )}
              </FormField>
              <FormField
                id={`t-${lessonId}`}
                label="Начало"
                hint="С 08:00 до 21:00"
                error={e.time}
                className="min-w-32 flex-1"
              >
                {(control) => (
                  <Input
                    {...control}
                    type="time"
                    name="time"
                    defaultValue={defaultTime}
                    min="08:00"
                    max="21:00"
                    step={300}
                    required
                  />
                )}
              </FormField>
            </div>
            <FormField
              id={`r-${lessonId}`}
              label="Аудитория (необязательно)"
              hint={`Сейчас — ауд. ${room}. Пусто — останется прежняя`}
              error={e.room}
            >
              {(control) => <Input {...control} name="room" maxLength={20} autoComplete="off" />}
            </FormField>
            <FormField
              id={`why-${lessonId}`}
              label="Причина"
              hint="Её увидят студенты: «Преподаватель на конференции»"
              error={e.reason}
            >
              {(control) => <TextArea {...control} name="reason" maxLength={200} required />}
            </FormField>
          </>
        );
      }}
    </DialogForm>
  );
}
