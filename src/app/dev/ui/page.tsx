import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, RotateCw, Search } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { EmptyState } from "@/components/empty-state";
import { FormAlert } from "@/components/form-alert";
import { FormField } from "@/components/form-field";
import { PasswordInput } from "@/components/password-input";
import { ErrorState } from "@/components/error-state";
import { LogoMark } from "@/components/logo-mark";
import { UnreadBadge } from "@/components/nav/unread-badge";
import { PageHeader } from "@/components/page-header";
import { SiteFooter } from "@/components/site-footer";
import {
  PageHeaderSkeleton,
  SkeletonCard,
  SkeletonList,
  SkeletonText,
} from "@/components/skeletons";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getThemePreference } from "@/lib/theme-server";

export const metadata: Metadata = { title: "Витрина компонентов" };

// Витрина дизайн-системы — только для разработки и скриншотов в отчёт (scripts/screenshot-ui.mjs).
// В прод-сборке — 404 (проверяет tests/e2e/shell.spec.ts). Данных здесь нет и не будет.
// ConceptBanner показан в футере (SiteFooter) — второй экземпляр не дублируем.

const TOKENS = [
  ["bg", "фон страницы"],
  ["surface", "карточки"],
  ["ink", "основной текст"],
  ["ink-muted", "вторичный текст"],
  ["line", "границы"],
  ["brand", "акцент"],
  ["brand-soft", "акцентные плашки"],
  ["ok", "зачтено, готово"],
  ["warn", "перенос, риск"],
  ["danger", "отмена, долг"],
  ["seal", "печать, «Выдана»"],
] as const;

const TYPE_SCALE = [
  ["text-3xl", "36 — заголовок экрана, десктоп", "font-heading font-bold"],
  ["text-2xl", "28 — заголовок экрана, мобильный", "font-heading font-bold"],
  ["text-xl", "22 — заголовок блока", "font-heading font-bold"],
  ["text-lg", "18 — подзаголовок", "font-heading font-semibold"],
  ["text-base", "16 — основной текст", ""],
  ["text-sm", "14 — подписи", ""],
  ["text-xs", "12 — мелкие пометки", ""],
] as const;

const STATUSES: { tone: StatusTone; label: string }[] = [
  { tone: "neutral", label: "Подана" },
  { tone: "brand", label: "В работе" },
  { tone: "ok", label: "Готова" },
  { tone: "seal", label: "Выдана" },
  { tone: "warn", label: "Перенос: было 10:10" },
  { tone: "danger", label: "Отменена" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl">{title}</h2>
      {children}
    </section>
  );
}

function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-ink-muted">{label}</p>
      {children}
    </div>
  );
}

export default async function DevUiPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const theme = await getThemePreference();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-3 px-4 py-2 md:px-6">
          <BrandMark href="/" subtitle="Дизайн-система" />
          <ThemeSwitcher value={theme} className="w-full sm:w-80" />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-12 px-4 pt-6 md:px-6 lg:pt-10">
        <PageHeader
          title="Витрина компонентов"
          description="Все кирпичики интерфейса во всех состояниях. Только для разработки."
        />

        <Section title="Логотип">
          <div className="flex flex-wrap items-end gap-6 rounded-xl border border-line bg-surface p-4">
            <LogoMark variant="sheet" className="size-40" label="Логотип «Протокол»" />
            <LogoMark className="size-12" />
            <LogoMark className="size-8" />
            <LogoMark className="size-4" />
            <BrandMark href="/" subtitle="Цифровой деканат" />
          </div>
        </Section>

        <Section title="Цвета">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {TOKENS.map(([token, purpose]) => (
              <li
                key={token}
                className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3"
              >
                <span
                  aria-hidden
                  className="size-10 shrink-0 rounded-lg border border-line"
                  style={{ background: `var(--${token})` }}
                />
                <span className="flex min-w-0 flex-col">
                  <code className="truncate text-sm">--{token}</code>
                  <span className="text-xs text-ink-muted">{purpose}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Типографика">
          <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
            {TYPE_SCALE.map(([cls, note, extra]) => (
              <div key={cls} className="flex flex-col gap-0.5">
                <span className={`${cls} ${extra}`}>Протокол: всё вовремя</span>
                <span className="text-xs text-ink-muted">
                  <code>{cls}</code>, {note}
                </span>
              </div>
            ))}
            <p className="text-base">
              Цифры — моноширинные: <span className="tabular">10:10, 87/100</span>
            </p>
          </div>
        </Section>

        <Section title="Кнопки">
          <Panel label="Варианты (44px — цель касания)">
            <div className="flex flex-wrap gap-3">
              <Button>
                <Plus aria-hidden data-icon="inline-start" />
                Заказать справку
              </Button>
              <Button variant="secondary">Скачать PDF</Button>
              <Button variant="outline">Добавить в календарь</Button>
              <Button variant="ghost">Подробнее</Button>
              <Button variant="destructive">Отменить заявку</Button>
              <Button variant="link">Все уведомления</Button>
            </div>
          </Panel>
          <Panel label="Размеры и состояния">
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg">Большая</Button>
              <Button>Обычная</Button>
              <Button size="sm">Плотная (только десктоп)</Button>
              <Button size="icon" aria-label="Искать">
                <Search aria-hidden />
              </Button>
              <Button disabled>Недоступна</Button>
            </div>
          </Panel>
        </Section>

        <Section title="Формы">
          <div className="grid gap-8 lg:grid-cols-2">
            <Panel label="Вход: обычное состояние">
              <div className="flex max-w-sm flex-col gap-4">
                <FormField
                  id="demo-login"
                  label="Логин"
                  hint="Как в студенческом билете, латиницей"
                >
                  {(p) => <Input {...p} name="login" autoComplete="username" />}
                </FormField>
                <FormField id="demo-password" label="Пароль">
                  {(p) => <PasswordInput {...p} name="password" />}
                </FormField>
                <Button className="w-full">Войти</Button>
              </div>
            </Panel>
            <Panel label="Вход: ошибка и отправка">
              <div className="flex max-w-sm flex-col gap-4">
                <FormAlert title="Неверный логин или пароль">
                  Проверьте раскладку клавиатуры и попробуйте ещё раз.
                </FormAlert>
                <FormField id="demo-login-err" label="Логин" error="Введите логин">
                  {(p) => <Input {...p} name="login" />}
                </FormField>
                <FormField id="demo-password-err" label="Пароль">
                  {(p) => <PasswordInput {...p} name="password" defaultValue="пароль" />}
                </FormField>
                <Button className="w-full" loading>
                  Входим…
                </Button>
              </div>
            </Panel>
          </div>
        </Section>

        <Section title="Статусы">
          <div className="flex flex-wrap gap-2">
            {STATUSES.map(({ tone, label }) => (
              <StatusChip key={label} tone={tone}>
                {label}
              </StatusChip>
            ))}
          </div>
          <Panel label="Бейдж непрочитанных">
            <div className="flex items-center gap-3">
              <UnreadBadge count={1} />
              <UnreadBadge count={3} />
              <UnreadBadge count={12} />
              <UnreadBadge count={120} />
            </div>
          </Panel>
        </Section>

        <Section title="Заголовок экрана">
          <div className="rounded-xl border border-line bg-bg p-4">
            <PageHeader
              title="Справка об обучении"
              description="Заявка № 2026-0142, подана сегодня"
              back={{ href: "/requests", label: "Все заявки" }}
              titleLevel={2}
              action={<StatusChip tone="brand">В работе</StatusChip>}
            />
          </div>
        </Section>

        <Section title="Состояния экрана">
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel label="Загрузка">
              <div className="flex flex-col gap-4 rounded-xl border border-line bg-bg p-4">
                <PageHeaderSkeleton />
                <SkeletonCard />
                <SkeletonList rows={2} />
                <SkeletonText />
              </div>
            </Panel>
            <div className="flex flex-col gap-4">
              <Panel label="Пусто">
                <EmptyState title="Сегодня пар нет. Можно выдохнуть" />
              </Panel>
              <Panel label="Пусто с действием">
                <EmptyState
                  stampPlace
                  title="Заявок пока нет — закажите первую справку"
                  action={
                    <Button asChild>
                      <Link href="/requests">Заказать справку</Link>
                    </Button>
                  }
                />
              </Panel>
              <Panel label="Ошибка">
                <ErrorState
                  title="Не получилось загрузить расписание"
                  action={
                    <Button>
                      <RotateCw aria-hidden data-icon="inline-start" />
                      Повторить
                    </Button>
                  }
                />
              </Panel>
              <Panel label="Пусто без пояснения">
                <EmptyState title="На этой неделе изменений нет" />
              </Panel>
            </div>
          </div>
        </Section>
      </main>

      <SiteFooter />
    </div>
  );
}
