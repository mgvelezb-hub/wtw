# Spike: ¿envolver la PWA en Capacitor?

**Fecha:** 2026-09-04 · **Estado:** cerrado con recomendación de NO hacerlo todavía

## La pregunta

El Plan de Cierre dejó anotado un spike de Capacitor para el sprint 4. La
pregunta real no es "¿se puede?" — se puede — sino: **¿qué gana Mau con una app
nativa que la PWA en la pantalla de inicio del iPad no le da ya?**

## Lo que se quería y ya está resuelto sin Capacitor

La razón original del spike eran las notificaciones. Ese motivo se cayó el
mismo día: los recordatorios del ritual y del cierre ya funcionan sobre Web Push
(commit 46329f9), en formato declarativo para que iOS pinte la notificación sin
depender de que el service worker despierte. iOS 18.4+ y Safari 18.4+ lo
soportan, y el iPad de Mau ya recibe la app desde la pantalla de inicio, que es
el requisito de Apple para push en web.

Queda **una** cosa que la PWA no puede hacer y Capacitor sí: notificaciones
locales programadas en el dispositivo, sin servidor. Hoy no hacen falta — el
cron de Vercel decide con el estado real de la DB, que es más útil que una
alarma local: un aviso local no puede saber si la semana ya está planeada, y un
recordatorio que llega cuando la cosa ya está hecha educa a ignorarlo.

## Lo que costaría

| Costo | Detalle |
|---|---|
| Cadena de build de iOS | Xcode + certificado de desarrollador + provisioning. Hoy el deploy es `git push` y Vercel. |
| Un segundo camino de release | La web se actualiza al recargar; el wrapper hay que recompilarlo y reinstalarlo a mano en el iPad. Dos versiones que se pueden desfasar. |
| Un service worker que ya no sirve | Dentro del wrapper el shell se sirve local; la caché versionada por commit (`app/sw.js/route.ts`) deja de tener sentido y hay que decidir otra estrategia offline. |
| Riesgo de sesión | La cookie httpOnly de sesión vive en el WebView. Hay que verificar que sobreviva a los reinicios del sistema; hoy en la PWA sobrevive. |

## Recomendación

**No hacerlo todavía.** Capacitor entra a la conversación cuando aparezca una
necesidad que el navegador no pueda cubrir. Las tres que lo justificarían, en
orden de probabilidad:

1. **Widget en la pantalla de inicio** con el bloque de ahora — eso el navegador
   no lo da y es el único que suena a que Mau lo pediría.
2. **Notificaciones locales** si algún día se quiere avisar sin depender del
   servidor (viaje, avión, Neon suspendido).
3. **Distribuir la app a alguien más del equipo** por TestFlight en vez de
   pedirle que agregue un sitio a su pantalla de inicio.

## Lo que este spike NO midió

Honestidad de alcance: no se compiló nada. No hay medición de arranque en frío
del WebView contra Safari, ni de consumo de batería, ni prueba de que la sesión
sobreviva a un reinicio dentro del wrapper. Si alguno de los tres detonantes de
arriba aparece, este spike se reabre y **entonces** se compila — antes de eso,
medir sería trabajo sobre una decisión que ya está tomada.
