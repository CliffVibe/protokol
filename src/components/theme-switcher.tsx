"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import {
  THEME_COLORS,
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  themeClass,
  type ThemePreference,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Светлая", icon: Sun },
  { value: "dark", label: "Тёмная", icon: Moon },
  { value: "system", label: "Системная", icon: Monitor },
];

function applyTheme(theme: ThemePreference) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    theme === "system"
      ? `${THEME_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`
      : `${THEME_COOKIE}=${theme}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;

  const root = document.documentElement;
  root.classList.remove("light", "dark");
  const cls = themeClass(theme);
  if (cls) root.classList.add(cls);

  // Цвет адресной строки — сразу; после router.refresh() Next отрисует тот же theme-color с сервера.
  const resolved =
    cls ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.removeAttribute("media");
    meta.setAttribute("content", THEME_COLORS[resolved]);
  });
}

type ThemeSwitcherProps = {
  /** Текущий выбор — сервер читает его из cookie. */
  value: ThemePreference;
  /** Только иконки (подписи остаются для скринридера) — для узкого сайдбара. */
  compact?: boolean;
  className?: string;
};

export function ThemeSwitcher({ value, compact = false, className }: ThemeSwitcherProps) {
  const router = useRouter();
  const name = useId();
  const [theme, setTheme] = useState(value);
  // Переключателей на странице может быть два (сайдбар и «Ещё»): после refresh сервер присылает
  // новое value — подхватываем его без эффекта.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setTheme(value);
  }
  const [, startTransition] = useTransition();

  function choose(next: ThemePreference) {
    setTheme(next);
    applyTheme(next);
    startTransition(() => router.refresh());
  }

  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className={cn("mb-2 text-small font-medium text-ink-muted", compact && "sr-only")}>
        Тема
      </legend>
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-bg p-1">
        {OPTIONS.map(({ value: option, label, icon: Icon }) => (
          <label
            key={option}
            title={compact ? label : undefined}
            className={cn(
              "flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-1 text-center text-small font-medium text-ink-muted transition-colors duration-150 ease-out",
              compact ? "gap-1.5" : "min-h-14 flex-col gap-1 py-1.5",
              "hover:text-ink has-checked:bg-surface has-checked:text-ink has-checked:shadow-sm",
              "has-focus-visible:outline-2 has-focus-visible:outline-ring",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={theme === option}
              onChange={() => choose(option)}
              className="sr-only"
            />
            <Icon aria-hidden className="size-4 shrink-0" />
            <span className={cn(compact && "sr-only")}>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
