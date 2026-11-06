"use client";

// «Отозвать справку» (T10): подтверждение в нативном <dialog> с обязательной причиной.
// Сервер ещё раз проверяет факультет и что справка не отозвана (revokeDocumentAction).
import { DialogForm, TextArea } from "@/components/dialog-form";
import { FormField } from "@/components/form-field";
import { revokeDocumentAction, type RevokeState } from "@/server/actions/staff";

export function RevokeDocument({ number }: { number: string }) {
  return (
    <DialogForm<RevokeState>
      triggerLabel="Отозвать справку"
      triggerVariant="destructive"
      title="Отозвать справку?"
      description="QR-код в выданных копиях начнёт показывать «Отозвана». Студент увидит причину в заявке и в уведомлении; на странице проверки её не будет."
      confirmLabel="Отозвать справку"
      confirmVariant="destructive"
      action={revokeDocumentAction}
      hidden={{ number }}
    >
      {(s) => (
        <FormField id="revoke-reason" label="Причина" error={s.fieldErrors?.reason}>
          {(control) => <TextArea {...control} name="reason" maxLength={500} required />}
        </FormField>
      )}
    </DialogForm>
  );
}
