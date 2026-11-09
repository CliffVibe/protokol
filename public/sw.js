// Service worker «Протокол» (T11): расписание на две недели открывается без сети.
// Свой файл, без библиотек: правил всего три.
//  1. /_next/static/* — cache-first: имена файлов с хешем, содержимое по адресу не меняется.
//  2. Навигация на /schedule — network-first: есть сеть — свежая страница (и копия в кэш), нет — копия.
//     Голый /schedule без сети ищет копию дня «сегодня по Москве» (?day=…), затем последнюю /schedule.
//  3. Прочая навигация без сети — /offline.html («Нет сети, расписание сохранено»).
// Список адресов на две недели присылает страница расписания (components/pwa/offline-schedule.tsx) —
// календарную логику здесь не повторяем. Кэш страниц — данные студента: он стирается при выходе
// (страница входа шлёт «clear», а ответ-редирект на /login стирает его здесь), чтобы на общем компьютере
// следующий человек офлайн не увидел чужое расписание.
"use strict";

const STATIC_CACHE = "protokol-static";
const PAGES_CACHE = "protokol-pages";
// v2 (T13): офлайн-страница в виде Б′ — новое имя кэша, иначе установленный service worker отдавал бы старый CSS
const SHELL_CACHE = "protokol-shell-v2";
const KNOWN = [STATIC_CACHE, PAGES_CACHE, SHELL_CACHE];
const OFFLINE_URL = "/offline.html";
const SHELL = [OFFLINE_URL, "/offline.css", "/icon.svg"];
const STATIC_LIMIT = 150;
/** Докачанную страницу не перекачиваем чаще, чем раз в 6 часов */
const FRESH_MS = 6 * 60 * 60 * 1000;
const CACHED_AT = "x-protokol-cached-at";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !KNOWN.includes(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

/** /schedule без параметров или только с day/week — расписание студента. */
function isSchedule(url) {
  if (url.pathname !== "/schedule") return false;
  for (const key of url.searchParams.keys()) if (key !== "day" && key !== "week") return false;
  return true;
}

const pageKey = (url) => new Request(url.pathname + url.search);

function todayInMoscow() {
  // en-CA даёт ГГГГ-ММ-ДД — тот же формат, что ?day=
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date());
}

const isLoginRedirect = (res) => res.redirected && new URL(res.url).pathname === "/login";

/**
 * Счётчик очисток. Страница, скачанная ДО «стереть» (выход), не должна лечь в кэш ПОСЛЕ него: докачка двух
 * недель идёт секунды, и выход посреди неё оставлял бы чужое расписание (поймал e2e «выход стирает…», T11).
 */
let generation = 0;

async function clearPages() {
  generation += 1;
  await caches.delete(PAGES_CACHE);
}

async function putPage(url, res, gen) {
  const headers = new Headers(res.headers);
  headers.set(CACHED_AT, String(Date.now()));
  const body = await res.blob();
  if (gen !== generation) return;
  const cache = await caches.open(PAGES_CACHE);
  await cache.put(pageKey(url), new Response(body, { status: res.status, headers }));
}

async function cachedPage(url) {
  const cache = await caches.open(PAGES_CACHE);
  const opts = { ignoreVary: true };
  if (url.search === "") {
    const today = await cache.match(new Request(`/schedule?day=${todayInMoscow()}`), opts);
    if (today) return today;
  }
  return cache.match(pageKey(url), opts);
}

async function offlinePage() {
  return (
    (await caches.match(OFFLINE_URL)) ??
    new Response("Нет сети", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    })
  );
}

async function scheduleNavigation(request, url) {
  const gen = generation;
  try {
    const res = await fetch(request);
    // Навигация идёт с redirect: "manual" — редирект приходит «непрозрачным»: куда — не видно, но для
    // /schedule это всегда «вы не студент или не вошли» (proxy → /login, requireStudent). Кэш — стереть.
    if (res.type === "opaqueredirect" || isLoginRedirect(res)) {
      await clearPages();
      return res;
    }
    if (res.ok && (res.headers.get("content-type") ?? "").includes("text/html")) {
      await putPage(url, res.clone(), gen);
    }
    return res;
  } catch {
    return (await cachedPage(url)) ?? offlinePage();
  }
}

async function otherNavigation(request, url) {
  if (url.pathname === "/login") await clearPages();
  try {
    return await fetch(request);
  } catch {
    return offlinePage();
  }
}

async function staticAsset(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    await cache.put(request, res.clone());
    await trimStatic(cache);
  }
  return res;
}

async function trimStatic(cache) {
  const keys = await cache.keys();
  // keys() — в порядке добавления: удаляем самые старые
  for (const key of keys.slice(0, Math.max(0, keys.length - STATIC_LIMIT))) await cache.delete(key);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(staticAsset(request));
  } else if (SHELL.includes(url.pathname) && url.search === "") {
    // Стили и значок офлайн-страницы — из кэша: без этого «Нет сети» рисовалась без стилей (ux-reviewer T11)
    event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)));
  } else if (request.mode === "navigate") {
    event.respondWith(
      isSchedule(url) ? scheduleNavigation(request, url) : otherNavigation(request, url),
    );
  }
});

/** Докачать расписание на две недели и файлы уже открытой страницы (первый визит прошёл до воркера). */
async function cacheSchedule(urls, assets) {
  const statics = await caches.open(STATIC_CACHE);
  for (const href of assets) {
    const url = new URL(href, self.location.origin);
    if (url.origin !== self.location.origin || !url.pathname.startsWith("/_next/static/")) continue;
    if (await statics.match(url.href)) continue;
    try {
      const res = await fetch(url.href);
      if (res.ok) await statics.put(url.href, res);
    } catch {
      // нет сети — докачаем в следующий раз
    }
  }
  await trimStatic(statics);

  const gen = generation;
  for (const href of urls) {
    if (gen !== generation) return;
    const pages = await caches.open(PAGES_CACHE);
    const url = new URL(href, self.location.origin);
    if (url.origin !== self.location.origin || !isSchedule(url)) continue;
    const hit = await pages.match(pageKey(url), { ignoreVary: true });
    if (hit && Date.now() - Number(hit.headers.get(CACHED_AT) ?? 0) < FRESH_MS) continue;
    try {
      const res = await fetch(url.href, { credentials: "same-origin" });
      if (isLoginRedirect(res)) {
        await clearPages();
        return;
      }
      if (res.ok) await putPage(url, res, gen);
    } catch {
      return; // сеть пропала — остальное докачаем при следующем визите
    }
  }
}

self.addEventListener("message", (event) => {
  if (event.origin && event.origin !== self.location.origin) return;
  const data = event.data ?? {};
  if (data.type === "cache-schedule" && Array.isArray(data.urls) && Array.isArray(data.assets)) {
    event.waitUntil(cacheSchedule(data.urls.slice(0, 40), data.assets.slice(0, 200)));
  } else if (data.type === "clear") {
    event.waitUntil(clearPages());
  }
});
