export const dynamic = 'force-static'

// Antes public/sw.js: string de cache fijo ('wtw-shell-v1'), así que cada deploy
// nuevo escribía en el MISMO nombre de cache — el cleanup de `activate` (que borra
// caches con nombre distinto a CACHE) nunca tenía nada que borrar. Ya causó ver la
// app sin un botón recién deployado. VERCEL_GIT_COMMIT_SHA cambia en cada deploy,
// así que el nombre de cache cambia y el cleanup sí encuentra el cache viejo.
export function GET() {
  const version = process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev'
  const body = `const CACHE = 'wtw-shell-${version}';
// \`/dia\` NO va aquí. RegisterSW vive en el layout raíz, así que el SW también
// se registra desde /login: el \`addAll\` pedía /dia sin sesión, recibía el 307 a
// /login y guardaba el HTML de LOGIN bajo la clave /dia. Ese mismo objeto era el
// fallback offline, así que sin red la PWA mostraba el login aunque hubiera
// sesión, hasta el siguiente deploy. Solo se precachea lo que es igual para
// cualquiera, con o sin sesión.
const SHELL = ['/manifest.webmanifest'];

// Los mismos tokens de la app, en línea: una página de "sin red" que dependiera
// de la red para verse bien no serviría de nada.
const SIN_RED = '<!doctype html><html lang="es-MX"><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<title>Reckon — sin conexión</title>' +
  '<body style="margin:0;min-height:100dvh;display:grid;place-items:center;background:#eef2f2;color:#1a2323;' +
  'font:17px/1.45 \\'IBM Plex Sans\\',system-ui,-apple-system,sans-serif">' +
  '<main style="max-width:28rem;margin:1rem;padding:1.5rem;background:#fff;border:1px solid #ccdad8;border-radius:10px">' +
  '<h1 style="font-size:1.25rem;margin:0 0 .5rem">Sin conexión</h1>' +
  '<p style="margin:0 0 1rem;color:#5c6b6a">Esta pantalla no se ha abierto desde que estás sin red, así que no hay copia que mostrar. ' +
  'Lo que ya cronometraste sigue guardado en el servidor.</p>' +
  '<button onclick="location.reload()" style="font:inherit;min-height:44px;padding:.6rem 1rem;border:1px solid #0a7c82;' +
  'border-radius:8px;background:#0a7c82;color:#fff;font-weight:600">Reintentar</button></main>';

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

// Una navegación solo se guarda si vale la pena servirla después: 200 propio y
// SIN redirecciones. Guardar una respuesta redirigida rompía la navegación
// offline en duro — el navegador rechaza servir con \`respondWith\` una respuesta
// con \`redirected: true\` para una petición \`navigate\` — así que en vez de
// degradar, fallaba.
function vaAlCache(res) {
  return res.ok && res.type === 'basic' && !res.redirected;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // \`waitUntil\`, no una promesa suelta: el evento puede terminar antes
          // de que el put alcance a escribir.
          if (vaAlCache(res)) {
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE).then((c) => c.put(request, copy)));
          }
          return res;
        })
        // Sin red se sirve lo último guardado de ESTA ruta. Ya no hay fallback a
        // /dia: servir el día de alguien más —o el login— en lugar de la página
        // pedida es peor que decir que no hay red. Si tampoco hay copia, una
        // página propia; \`caches.match\` de algo que no existe resuelve
        // \`undefined\`, y un \`respondWith(undefined)\` es un error de red a secas.
        .catch(() =>
          caches.match(request).then((r) => r || new Response(SIN_RED, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
        )
    );
    return;
  }
  if (request.url.includes('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (vaAlCache(res)) {
              const copy = res.clone();
              event.waitUntil(caches.open(CACHE).then((c) => c.put(request, copy)));
            }
            return res;
          })
      )
    );
  }
});

// El logout manda este mensaje: la cookie se va, pero el HTML autenticado vivía
// en la caché y offline se seguía pintando el /dia del usuario anterior. En un
// dispositivo compartido eso es una fuga, no una molestia.
self.addEventListener('message', (event) => {
  if (event.data && event.data.tipo === 'wtw:limpiar-cache') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});
`

  return new Response(body, { headers: { 'Content-Type': 'application/javascript' } })
}
