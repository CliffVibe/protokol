"use client";

// «Перенести пару» (T09): нативный <dialog> через DialogForm (Radix вставлял бы <style> без nonce — прод-CSP).
// Новая дата и время, аудитория (необязательно), причина — её увидят студенты. Длительность пары сохраняется.
// T14+: накладку (группа, языковая пара, преподаватель, аудитория) ловит сервер — ошибка у поля, а если
// занята аудитория — свободные в корпусе в это время кнопками: одно касание подставляет номер.
import { useRef } from "react";
import { DialogForm, TextArea } from "@/components/dialog-form";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
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
  const roomRef = useRef<HTMLInputElement>(null);
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
        const v = state.values;
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
                    defaultValue={v?.date ?? defaultDate}
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
                    defaultValue={v?.time ?? defaultTime}
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
              hint={e.room ? undefined : `Сейчас — ауд. ${room}. Пусто — останется прежняя`}
              error={e.room}
            >
              {(control) => (
                <Input
                  {...control}
                  ref={roomRef}
                  name="room"
                  maxLength={20}
                  autoComplete="off"
                  defaultValue={v?.room ?? ""}
                />
              )}
            </FormField>
            {state.freeRooms ? (
              // Сразу под ошибкой «занята»: текст ошибки говорит «выберите свободную ниже»
              <div
                role="group"
                aria-labelledby={`free-${lessonId}`}
                className="-mt-2 flex flex-col gap-1.5"
              >
                <p id={`free-${lessonId}`} className="text-sm text-ink">
                  {state.freeRooms.label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {state.freeRooms.rooms.map((r) => (
                    <Button
                      key={r}
                      type="button"
                      variant="outline"
                      className="min-h-11 min-w-11 tabular"
                      aria-label={`Подставить ауд. ${r}`}
                      onClick={() => {
                        if (!roomRef.current) return;
                        roomRef.current.value = r;
                        roomRef.current.focus();
                      }}
                    >
                      {r}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            <FormField
              id={`why-${lessonId}`}
              label="Причина"
              hint="Её увидят студенты: «Преподаватель на конференции»"
              error={e.reason}
            >
              {(control) => (
                <TextArea
                  {...control}
                  name="reason"
                  maxLength={200}
                  required
                  defaultValue={v?.reason ?? ""}
                />
              )}
            </FormField>
          </>
        );
      }}
    </DialogForm>
  );
}
