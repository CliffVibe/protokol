"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FormAlert } from "@/components/form-alert";
import { FormField } from "@/components/form-field";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login, type LoginState } from "@/server/actions/auth";

type Field = "login" | "password";

// Форма входа. Работает и без JS: action — Server Action, ошибки приходят с сервера.
// Ошибка одинаковая для «нет логина» и «неверный пароль» (S2) — по ней не узнать, есть ли логин.
export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const loginRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  // Поле, которое начали править после ответа, больше не показывает старую ошибку.
  // Храним, для какого ответа сервера ошибку скрыли: новый ответ — новые ошибки.
  const [edited, setEdited] = useState<Partial<Record<Field, LoginState>>>({});
  const errorOf = (f: Field) => (edited[f] === state ? undefined : state.fieldErrors?.[f]);
  const onEdit = (f: Field) => () => setEdited((e) => (e[f] === state ? e : { ...e, [f]: state }));

  // Кнопка на время отправки недоступна, и фокус с неё падает на <body> (ux-reviewer, T03).
  // После ответа возвращаем фокус туда, где нужно исправить: поле с ошибкой, иначе — пароль.
  useEffect(() => {
    if (state.fieldErrors?.login) loginRef.current?.focus();
    else if (state.fieldErrors?.password || state.error) passwordRef.current?.focus();
  }, [state]);

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

      <FormField id="login" label="Логин" error={errorOf("login")}>
        {(control) => (
          <Input
            {...control}
            ref={loginRef}
            name="login"
            defaultValue={state.login}
            onChange={onEdit("login")}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={64}
            required
          />
        )}
      </FormField>

      <FormField id="password" label="Пароль" error={errorOf("password")}>
        {(control) => (
          <PasswordInput
            {...control}
            ref={passwordRef}
            name="password"
            onChange={onEdit("password")}
            maxLength={128}
            required
          />
        )}
      </FormField>

      <Button type="submit" size="lg" loading={pending} className="w-full">
        Войти
      </Button>
    </form>
  );
}
