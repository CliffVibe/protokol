import type { MetadataRoute } from "next";
import { THEME_COLORS } from "@/lib/theme";

// Манифест PWA (T11): «Протокол» ставится на экран телефона как приложение, расписание открывается
// без сети (public/sw.js).
// Цвета — тёмной темы (проверка человека на Android, 10.11 и 12.11): установленное приложение красит ими
// системную полосу под кнопками «назад/домой» и на страницу не смотрит. Варианта для двух тем в манифесте нет.
// Белый цвет давал белую полосу под тёмной темой; без цветов Chrome тоже ставит белый.
// Тёмная полоса под светлой темой выглядит как обычная рамка, белая под тёмной — как дефект.
// Верх окна красит <meta name="theme-color"> под выбранную тему (src/lib/theme.ts).
// Отдаётся без входа (исключён из matcher в proxy.ts): браузер читает его ещё на странице входа.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Протокол — цифровой деканат",
    short_name: "Протокол",
    description:
      "Концепт для конкурса: расписание, оценки, заявки и справки студента. Не является официальным сервисом МГИМО.",
    lang: "ru",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    theme_color: THEME_COLORS.dark,
    background_color: THEME_COLORS.dark,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
