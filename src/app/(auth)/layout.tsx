// Оболочка экрана входа: без навигации и без проверки доступа (до входа её не к чему применять).
// Плашку концепта страница входа ставит сама — наверху, чтобы на 360px она была видна без прокрутки.
import { SkipLink } from "@/components/skip-link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-[1120px] flex-1 px-4 pt-6 pb-10 outline-none md:px-6 lg:pt-14"
      >
        {children}
      </main>
    </div>
  );
}
