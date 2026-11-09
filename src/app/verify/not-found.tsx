import type { Metadata } from "next";
import { SearchX } from "lucide-react";

// «Справка не найдена» для /verify (T10): битый, обрезанный или выдуманный токен. HTTP 404.
// Без подробностей: не различаем «не было» и «опечатка» — проверяющему важно одно: не подтверждено.
export const metadata: Metadata = {
  title: "Справка не найдена",
  robots: { index: false, follow: false },
};

export default function VerifyNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <section
        aria-labelledby="verify-title"
        className="flex gap-4 border-l-4 border-ink-muted py-1 pl-4 text-ink-muted"
      >
        <SearchX aria-hidden className="mt-1 size-[32px] shrink-0" />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 id="verify-title" className="text-xl break-words text-ink lg:text-2xl">
            Справка не найдена
          </h1>
          <p lang="en" className="text-lg text-ink">
            Certificate not found
          </p>
        </div>
      </section>
      <div className="flex flex-col gap-1 text-sm text-ink-muted">
        <p>
          Проверьте, что QR-код отсканирован целиком, или наберите адрес из справки вручную. Если
          адрес верный, а справки нет — она не выдавалась через Протокол.
        </p>
        <p lang="en">
          Make sure the whole QR code was scanned, or type the address from the certificate. If the
          address is correct, this certificate was not issued through Protokol.
        </p>
      </div>
    </div>
  );
}
