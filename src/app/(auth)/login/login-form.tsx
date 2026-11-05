"use client";

import { useActionState } from "react";
import { FormAlert } from "@/components/form-alert";
import { FormField } from "@/components/form-field";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login, type LoginState } from "@/server/actions/auth";

// Форма входа. Работает и без JS: action — Server Action, ошибки приходят с сервера.
// Ошибка одинаковая для «нет логина» и «неверный пароль» (S2) — по ней не узнать, есть ли логин.
export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {state.error === "invalid" ? (
        <FormAlert title="Неверный логин или пароль">
          Проверьте раскладку клавиатуры и Caps Lock и попробуйте ещё раз.
        </FormAlert>
      ) : null}
      {state.error === "locked" ? (
        <FormAlert title="Слишком много попыток входа">
          Подождите 5 минут и попробуйте снова.
        </FormAlert>
      ) : null}

      <FormField id="login" label="Логин" error={state.fieldErrors?.login}>
        {(control) => (
          <Input
            {...control}
            name="login"
            defaultValue={state.login}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={64}
            required
          />
        )}
      </FormField>

      <FormField id="password" label="Пароль" error={state.fieldErrors?.password}>
        {(control) => <PasswordInput {...control} name="password" maxLength={128} required />}
      </FormField>

      <Button type="submit" size="lg" loading={pending} className="w-full">
        Войти
      </Button>
    </form>
  );
}
