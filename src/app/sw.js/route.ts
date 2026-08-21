export const dynamic = 'force-static'

// Antes public/sw.js: string de cache fijo ('wtw-shell-v1'), así que cada deploy
// nuevo escribía en el MISMO nombre de cache — el cleanup de `activate` (que borra
// caches con nombre distinto a CACHE) nunca tenía nada que borrar. Ya causó ver la
// app sin un botón recién deployado. VERCEL_GIT_COMMIT_SHA cambia en cada deploy,
// así que el nombre de cache cambia y el cleanup sí encuentra el cache viejo.
export function GET() {
  const version = process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev'
  const body = `const CACHE = 'wtw-shell-${version}';
const SHELL = ['/dia', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('/dia')))
    );
    return;
  }
  if (request.url.includes('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
            return res;
          })
      )
    );
  }
});
`

  return new Response(body, { headers: { 'Content-Type': 'application/javascript' } })
}
