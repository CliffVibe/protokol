import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { SystemPage } from "@/components/system-page";
import { Button } from "@/components/ui/button";

// Общая 404. Чужой ресурс тоже приходит сюда (notFound(), docs/05-security.md → S1),
// поэтому текст не подтверждает, существует ли адрес.
export const metadata: Metadata = { title: "Страница не найдена" };

export default function NotFound() {
  return (
    <SystemPage
      code="Ошибка 404"
      icon={SearchX}
      tone="muted"
      title="Такой страницы нет"
      actions={
        <Button asChild>
          <Link href="/">На главную</Link>
        </Button>
      }
    >
      <p>Возможно, ссылка устарела или в адресе опечатка.</p>
      <p>Расписание, учёба и заявки — на главной.</p>
    </SystemPage>
  );
}
