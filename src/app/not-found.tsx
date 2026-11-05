import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { EmptyState } from "@/components/empty-state";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";

// Общая 404. Чужой ресурс тоже приходит сюда (notFound(), docs/05-security.md → S1),
// поэтому текст не подтверждает, существует ли адрес.
export const metadata: Metadata = { title: "Страница не найдена" };

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface px-4 md:px-6">
        <BrandMark href="/" className="h-14" />
      </header>
      <main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-6 px-4 pt-10 md:px-6">
        <EmptyState
          icon={SearchX}
          headingLevel={1}
          title="Такой страницы нет"
          description="Возможно, ссылка устарела или в адресе опечатка."
          action={
            <Button asChild>
              <Link href="/">На главную</Link>
            </Button>
          }
        />
      </main>
      <SiteFooter />
    </div>
  );
}
