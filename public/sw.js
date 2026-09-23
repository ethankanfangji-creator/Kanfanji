/* KanFangJi minimal offline shell. Keep policy mirrored in lib/offline-cache-policy.ts. */
const VERSION = "kanfangji-shell-v1";
const SHELL = ["/", "/offline", "/manifest.webmanifest"];
const PRIVATE_PAGES = ["/s/", "/c/", "/invite/", "/viewings", "/compare/"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith("kanfangji-shell-") && key !== VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

function isPrivatePath(pathname) {
  const isAtOrBelow = (prefix) => {
    const root = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
    return pathname === root || pathname.startsWith(`${root}/`);
  };
  return isAtOrBelow("/api") || PRIVATE_PAGES.some(isAtOrBelow);
}

function mayCache(request, url) {
  if (request.method !== "GET" || url.origin !== self.location.origin || isPrivatePath(url.pathname)) {
    return false;
  }
  if (
    url.searchParams.has("token") ||
    url.searchParams.has("signature") ||
    url.searchParams.has("X-Amz-Signature")
  ) {
    return false;
  }
  return request.mode === "navigate" || url.pathname.startsWith("/_next/static/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (!mayCache(request, url)) return;

  if (request.mode === "navigate") {
    if (url.pathname !== "/" && url.pathname !== "/offline") {
      event.respondWith(fetch(request).catch(() => caches.match("/offline")));
      return;
    }
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            event.waitUntil(caches.open(VERSION).then((cache) => cache.put(request, copy)));
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) || caches.match("/offline")),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            event.waitUntil(caches.open(VERSION).then((cache) => cache.put(request, copy)));
          }
          return response;
        }),
    ),
  );
});
