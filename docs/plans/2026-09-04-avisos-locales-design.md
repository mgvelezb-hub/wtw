# Avisos locales en el cascarón iOS — diseño (2026-09-04)

**Problema.** El push web quedó implementado pero sin encender: Mau decidió que las
notificaciones se resuelven en la app nativa. El spike de Capacitor probó que una
notificación local llega sin servidor. Falta que el ritual y el cierre usen ese canal
con la MISMA regla que el cron: *un aviso que llega cuando la cosa ya está hecha educa a
ignorarlo*.

**Tensión.** Una notificación local se programa por adelantado; el estado ("¿ya está
planeada la semana?", "¿queda hueco sin explicar?") solo se conoce al momento de
disparar. No hay forma de evaluar en el dispositivo a las 17:30 sin servidor.

**Decisión: lo segundo mejor, y decirlo.** El servidor decide qué avisos hacen falta
AHORA y el cascarón deja el dispositivo igual: cancela los nuestros y programa los que
aplican. Se resincroniza cada vez que la app vuelve al frente y al cambiar de pantalla
(freno de 60 s). Así:

- Planear la semana o cerrar el día **desde el iPad** cancela el aviso solo, porque la
  navegación posterior dispara la sync.
- Hacerlo **desde la Mac** sin abrir el iPad antes deja un aviso de más. Es el límite
  conocido y está escrito en Ajustes. Lo cierra el push remoto (APNs), que necesita la
  cuenta de desarrollador de pago.
- El cierre no puede prometer un número ("N min sin explicar") porque no lo sabe por
  adelantado: el texto local es genérico y el del cron sigue midiendo al mandar.

## Piezas

| Pieza | Dónde | Qué |
|---|---|---|
| Lógica pura | `src/lib/avisos-locales.ts` | `planLocal(recordatorios, ahora, zona, estado)` → avisos con instante UTC, ids fijos (`1001` ritual, `1002` cierre). `instanteLocal`/`proximaOcurrencia` sin librerías. 9 tests. |
| Estado real | `src/lib/avisos.ts` (server-only) | `estadoAvisos(userId, zona, ahora)`; ahí se movieron `avisoRitual`/`avisoCierre`/`momentoLocal`/`fechaLocal` que vivían en el cron, para que push web y local compartan la definición de "planeada" y "cerrado". 3 tests contra la base local. |
| Endpoint | `GET /api/nativo/avisos` | Cookie de sesión (el WKWebView la manda solo). 401 sin sesión. |
| Puente | `src/lib/nativo.ts` | `sincronizarAvisosLocales`, `activar/desactivarAvisosLocales` (interruptor por dispositivo en localStorage `wtw.avisos-locales`), `avisosPendientes`, listeners de tap y de vuelta al frente. |
| Montaje | `src/app/nativo-bridge.tsx` en el layout raíz | Tap → `router.push(ruta)`. Vuelta al frente → sync forzada. Cambio de ruta → sync con freno. En Safari no hace nada. |
| Ajustes | `Recordatorios.tsx` + `Nativo.tsx` | En el cascarón, el bloque de push web se sustituye por `AvisosNativos`: activar con el gesto, apagar, y la lista de lo que iOS tiene programado (verificable, no prometido). Guardar un horario reprograma. |

## Lo que NO cambia

- El cron del push web sigue igual (solo importa de `lib/avisos.ts`). Si algún día se
  enciende, los dos canales dan el mismo veredicto.
- El permiso de notificaciones se pide con un gesto, nunca al cargar.
- La web en Safari no ve nada de esto: `useEsNativo()` es la única puerta.

## Pendiente de verificar con sesión real

La UI del cascarón vive detrás del login y yo no tecleo contraseñas: la activación, la
lista de pendientes y el tap que navega se prueban con Mau logueado en el simulador o
en su iPad tras el deploy.
