# Modo Focus — pantalla completa para trabajar sin distracciones

> Diseño aprobado 2026-07-20 (sesión Sonnet, brainstorming). Origen: Mau quiere una vista de
> pantalla completa (iPad, celular, pantalla externa) para la actividad en curso, sin perder
> noción del tiempo ni de sus juntas reales mientras se concentra.
>
> Primera de tres herramientas nuevas evaluadas en esta sesión (orden acordado: **Modo Focus
> → Gantt de Plan de Trabajo → Ayudante**). Las otras dos quedan pendientes de brainstorming.

## §0 — El objetivo

Mau quiere concentrarse en una actividad sin perder de vista: cuánto tiempo lleva, qué hora
es, si tiene una junta real por venir, y qué sigue después. Hoy `/dia` muestra todo esto pero
mezclado con sidebar, lista de tareas y navegación — ruido cuando lo que se necesita es una
sola cosa en grande, en una pantalla que puede ser un iPad o un monitor externo sobre el
escritorio.

**Principio rector:** esto es una vista nueva sobre datos y acciones que ya existen. Cero
lógica de negocio nueva — `getDayBlocks`, `startTimerAction`, `stopTimerAction`,
`toggleDodItemAction`, `markTaskDoneAction` ya resuelven todo lo necesario, incluida la
distinción entre juntas reales de calendario (`bloqueante: true`) y actividades generadas por
la app.

## §1 — Decisiones tomadas

| Decisión | Elección | Por qué |
|---|---|---|
| Estética | **Dark HUD de lujo** — fondo casi negro, serif elegante para el reloj, acentos dorados sutiles. Distinto de la identidad VP Consulting (teal/dorado de marca) | Es una herramienta personal de concentración, no un entregable de cliente — el lenguaje visual es de reloj/tablero premium, no de reporte corporativo |
| Entrada/salida | Botón manual "Modo Focus" junto al timer activo en `/dia`. Salida con X o Esc | Simple, sin sorpresas; el timer corre igual dentro o fuera de Focus |
| Aviso de junta próxima | Se resalta (acento dorado) a los **5 minutos** antes de una junta bloqueante | Balance entre aprovechar el tiempo de foco y no llegar tarde |
| Actividad termina antes de tiempo | Modal: *"¿Iniciar [siguiente actividad] ahora?"* Sí → arranca timer. No → Focus queda en espera tranquila (reloj + cuenta regresiva al horario planeado), **nunca arranca sola** | Pedido explícito: control manual siempre, sin autostart silencioso |
| Actividad sin bloque de la semana (ad-hoc) | Focus funciona igual con lo que haya — sin sección de DoD/planeado si no existen | No todo timer nace de un bloque planeado |
| Wake Lock no soportado | Aviso discreto una sola vez, no falla en silencio | El usuario necesita saber por qué se podría apagar la pantalla |
| Reconexión / recarga | El timer se reconstruye desde `TimeEntry.startedAt` (ya persistido en servidor) — nunca se pierde por cerrar pestaña o caída de WiFi | Confiabilidad es el punto central de una vista "sin distracciones" |

## §2 — Composición visual

Pantalla completa, sin `AppShell` (sin sidebar), fondo `#0a0a0a` o similar. Cuatro zonas:

**Centro — Actividad activa** (dominante):
- Chip de proyecto (color del proyecto)
- Título de la actividad, serif grande
- Subactividades (DoD items) como checklist minimalista, togglable sin salir de Focus
- Timer en tiempo real, tipografía monoespaciada grande tipo cronómetro, con el planeado como
  referencia tenue debajo (ej. `42:18 / 90:00 planeados`). Al rebasar el planeado, ese número
  de referencia pasa a un tono ámbar tenue — sin alarmas, solo señal visual.

**Esquina superior — Reloj y fecha:**
- Hora digital 24h, serif/mono fina y grande, estilo reloj de lujo
- Fecha debajo, más pequeña y discreta

**Esquina — Próxima junta real** (solo si existe, filtrada por `bloqueante: true`):
- Discreta si faltan más de 5 min; se resalta con cuenta regresiva a los 5 min
- Si no hay junta próxima, la zona no aparece — sin hueco vacío

**Franja inferior — Siguiente actividad en sombra:**
- Texto atenuado/translúcido: título + horario planeado de lo que sigue en el día
- Si ya se pasó su horario planeado por el overrun de la actividad actual, lo indica
  (ej. "Debía empezar hace 12 min")

**Controles** (aparecen al hover/tap, se ocultan solos): Pausar, Terminar tarea, Salir (X/Esc).

## §3 — Arquitectura técnica

- **Ruta nueva:** `/dia/focus` — layout propio, sin `AppShell`, fondo oscuro a nivel página.
- **Datos:** reutilizar `getDayBlocks` tal cual — ya resuelve actividad activa, DoD items,
  junta próxima (`bloqueante`) y siguiente bloque del día. Cero queries nuevas.
- **Acciones:** reutilizar `startTimerAction`, `stopTimerAction`, `toggleDodItemAction`,
  `markTaskDoneAction` de `dia/actions.ts`. Cero endpoints nuevos.
- **Timer en vivo:** calculado en cliente desde `TimeEntry.startedAt`. Seteo inicial en `null`,
  se llena en `useEffect` tras montar — evita el hydration mismatch ya documentado en
  `CLAUDE.md` (regla aprendida #1: nunca `useState(() => Date.now())`/`new Date()` como valor
  inicial en un componente que se renderiza en servidor).
- **Pantalla siempre encendida:** `navigator.wakeLock.request('screen')` al entrar, se libera
  al salir. Si no está soportado, aviso discreto una sola vez.
- **Refresco de junta próxima:** poll ligero cada ~2 min mientras se está en Focus, para
  capturar una junta recién sincronizada sin tener que salir y volver a entrar.
- **Salida:** X o `Esc` → regresa a `/dia`. Sin estado que limpiar; todo vive en servidor.

## §4 — Testing / verificación

Sin lógica de negocio nueva que probar de forma aislada — la verificación es principalmente
manual en el navegador (Playwright/browser tool):
1. Entrar a Focus con una actividad corriendo → timer coincide con el de `/dia`.
2. Junta próxima solo aparece si `bloqueante: true`; se resalta a los 5 min.
3. Marcar un DoD item sin salir de pantalla completa → se refleja al volver a `/dia`.
4. Recargar la página dentro de Focus → el timer no se reinicia (se reconstruye desde
   `TimeEntry.startedAt`).
5. Terminar la tarea antes de tiempo → aparece el modal; elegir "No" deja Focus en espera sin
   arrancar nada solo.
6. Wake Lock: si el navegador no lo soporta, aparece el aviso una sola vez (no en cada render).
