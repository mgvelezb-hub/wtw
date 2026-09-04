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

// Web Push para los navegadores que todavía NO entienden Declarative Web Push.
// El payload que manda \`lib/push.ts\` es el sobre declarativo (\`web_push: 8030\`),
// que iOS 18.4+ y Safari pintan SIN ejecutar nada de esto; aquí solo se traduce
// ese MISMO JSON, para no mantener dos formatos sincronizados.
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let datos;
  try {
    datos = event.data.json();
  } catch (e) {
    return;
  }
  const n = datos.notification;
  if (!n || !n.title) return;
  event.waitUntil(
    self.registration.showNotification(n.title, {
      body: n.body,
      tag: n.tag,
      icon: n.icon,
      lang: n.lang,
      data: { navigate: n.navigate },
    })
  );
});

// Si la app ya está abierta se reusa esa ventana: en el iPad, dos instancias de
// la PWA compitiendo por el mismo estado es peor que no abrir nada.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = event.notification.data && event.notification.data.navigate;
  if (!destino) return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      for (const cliente of lista) {
        if ('focus' in cliente) {
          cliente.navigate(destino);
          return cliente.focus();
        }
      }
      return self.clients.openWindow(destino);
    })
  );
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
