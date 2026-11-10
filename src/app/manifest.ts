import type { MetadataRoute } from "next";

// Манифест PWA (T11): «Протокол» ставится на экран телефона как приложение, расписание открывается
// без сети (public/sw.js).
// Цветов (theme_color, background_color) нет намеренно (T13, проверка человека на Android 10.11): установленный
// Chrome красит ими системную полосу под кнопками «назад/домой», а варианта для тёмной темы в манифесте нет —
// в тёмной теме внизу была белая полоса. Без них полоса — по теме телефона; верх окна красит
// <meta name="theme-color"> под выбранную тему (src/lib/theme.ts).
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
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
