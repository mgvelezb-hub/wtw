# QA de experiencia y funcionalidad — WTW App (2026-09-08)

Cuatro revisores (agentes Opus, solo lectura) recorrieron cada módulo y cada parte de cada
módulo con dos lentes: experiencia de usuario en iPad y corrección funcional. Contexto que
leyeron: `CLAUDE.md`, `PRODUCT.md`, `DESIGN.md`. Abajo, primero lo que se repite en los
cuatro reportes (eso es lo que hay que atacar como sistema, no como lista), luego los
reportes completos por módulo con `archivo:línea`.

## Resumen ejecutivo — lo que aparece en más de un módulo

| Tema transversal | Dónde se ve | Qué hacer (una vez, para toda la app) |
|---|---|---|
| **Sin red de seguridad**: no existe `error.tsx`, `loading.tsx` ni `global-error.tsx`. Un 500 (Neon dormido, un `throw` de Server Action) deja al usuario atrapado dentro del cascarón, sin barra de direcciones ni recarga. | Todos | `src/app/(app)/error.tsx` + `loading.tsx` + `src/app/global-error.tsx` con copy en la voz de la app y "Reintentar". **1 h, prioridad 1.** |
| **Errores en español que nunca llegan**: Next redacta los `throw` de Server Actions en prod; los mensajes ya escritos salen como cadena opaca en inglés. | desarrollo, literatura, evidence, dia | Adoptar el patrón `{ ok: false, error }` que ya existe en `proyectos/[id]/evidencia-actions.ts:27`. |
| **Blancos táctiles < 44 px** en el dispositivo principal: el "?" de ayuda mide 18 px; ✓/✕ de edición en línea ~12 px; ▶/✓ del día 36 px; selects y checkboxes `py-0.5`; sidebar 24–36 px; paso 3 del ritual. | Todos | Convención única (`min-h-11` / pseudo-elemento de 44 px) aplicada de una vez; empezar por "?" y ✓/✕ porque errar el tap **descarta lo tecleado**. |
| **Inputs < 16 px disparan el auto-zoom de iOS** en cada tap; y `viewport` sin `viewportFit: 'cover'` deja `env(safe-area-inset-*)` en 0 (el home indicator tapa la nav inferior en iPhone). | Todos | Inputs a 16 px en `globals.css`; `viewportFit: 'cover'` en `layout.tsx:27`. **5 min.** |
| **Fechas en UTC sobre timestamps reales**: `toISOString().slice(0,10)` en 6+ sitios y `getHours()` local en "Ahora" de /dia y /semana. Después de las 18:00 CDMX todo sale fechado mañana. | caso, proyectos, literatura, desarrollo, resumen, dia, semana, equipo | `todayStr()` / `nowMinutesMx()` de `lib/dates.ts` en todas las reincidencias. |
| **Integridad del número medido** (la tesis de la app): el cierre suma TimeEntries de otros días (doble conteo); el desvío promovido crea un TimeEntry a medianoche UTC que contamina la señal de erosión; descartar borra el bloque y cambia el planeado retroactivo; borrar semana revive tareas `done`; "Asignación" compara toda la vida contra un objetivo semanal. | cierre, dia, semana/nueva, proyectos | Cinco fixes S, todos en `service.ts`/`actions.ts`, con test cada uno. **Es el bloque de mayor retorno del informe.** |
| **DnD que miente**: soltar en Flex no quita la hora (el optimista pinta flex y el server lo regresa); el drop se reubica en cascada sin aviso; el fantasma dice una hora y se escribe otra. | semana, dia | `moverBloqueAction` escribe `inicio/fin = flex`; feedback del server tras reubicar; deshacer de 5 s. |
| **Seguridad multiusuario** (segundo anillo de PRODUCT.md): `textoRich` sin sanear en dos `dangerouslySetInnerHTML`; invitación de equipo sin validar email ni rol; login sin throttling y con enumeración por tiempo; PAT sin rotación; el SW precachea `/dia` como HTML de login y no borra caché en logout. | dia, proyectos, equipo, login, sw | `sanitize-html` al guardar; rol + email en `equipo/actions.ts`; `bcrypt.compare` señuelo; sacar `/dia` del precache. |
| **Código escrito y no cableado**: `borrarInteraccionAction`, `portal-actions.ts` (portal de cliente completo sin UI), `Project.presupuestoAliadoHoras`, `StakeholderInteraccion.minutaId`. | stakeholders, proyectos, aliado | ~20 líneas cada uno para desbloquear features ya pagadas. |
| **Planeador**: el draft de localStorage no se escopa por semana; las tres AI actions del ritual llaman `contextoPlaneacion` sin `isoWeek` y pueden mirar otra semana. | semana/nueva | Guardar `{isoWeek, draft}`; pasar `ctx.isoWeek` a `recap/sugerirWins/premortem`. |

### Top 12 global (impacto × esfuerzo), en orden de ataque

1. `error.tsx` + `loading.tsx` + `global-error.tsx` — S.
2. `cierre/service.ts:147,324` medido filtrado por día; `:420-447` TimeEntry sintético a las 12:00 MX — S.
3. `viewportFit: 'cover'` + inputs a 16 px — S.
4. Soltar en Flex/cabecera escribe `flex` de verdad (`semana/actions.ts:41`) — S.
5. `NaN` en health score y asimetría 3:1 rota (`stakeholders/service.ts:181,187`) — S.
6. Draft del planeador por semana + `isoWeek` en las AI actions — S.
7. Entregable vencido en verde (`proyectos/[id]/service.ts:20`) — S.
8. Invitación de equipo: email + rol (`equipo/actions.ts:7`) — S.
9. `sanitize-html` en minutas (`minuta-actions.ts:136`) — S.
10. Blancos táctiles a 44 px, empezando por "?" y ✓/✕ — M.
11. `{ok,error}` en las actions que hoy lanzan — M.
12. SW: sacar `/dia` del precache, no cachear redirects, borrar caché en logout — S.

### Desarrollos nuevos que los cuatro reportes justifican con PRODUCT.md

- **Widget de iOS** con el bloque de ahora y el cronómetro (necesita App Groups = cuenta Pro) y **Live Activity** del cronómetro.
- **APNs** para cerrar el aviso de más cuando se planea desde la Mac (cuenta Pro).
- **Atajos / Siri**: "empieza el bloque", "cierra mi día".
- **Share Extension** del cascarón: capturar al inbox desde Mail/Slack.
- **Suscripción ICS** de la semana (la exportación ya existe en `api/v1/calendar/export`).
- **Status a Slack** en la voz de Mau reusando el ensamblador de /resumen.
- **Cierre en cola** (días sin reconciliar) y **reflow como propuesta** ("mueve 3 bloques, 1 fuera de jornada — aplicar"): principio "la IA propone, el humano dispone".
- **Calibración del pre-mortem**: marcar `ocurrio`/`defensaFunciono` desde la app.
- **Deshacer de 5 s** en todo DnD y en Descartar.
- **⌘K con acciones** y botón de búsqueda táctil en el rail.

---

## QA — WTW App · módulos `/dia` y `/cierre`

Revisión solo de lectura. Contexto leído: `CLAUDE.md`, `PRODUCT.md`, `DESIGN.md`.

---

## 1. Marco de Mi Día (`page.tsx` + `BarraEstadoDia`)

**Qué hace bien.** La barra de estado cumple el principio "instrumento": un renglón, 12.5 px, color solo donde algo está fuera de rango. El `DndContext id="dia-board"` (`DiaBoard.tsx:553`) y `useReloj` (`lib/reloj.ts`) resuelven bien los dos focos clásicos de hydration.

**Bugs / riesgos**
- **Alta — fin de semana rompe el día.** Las pestañas salen de `capacidad.dias`, que solo genera 5 fechas lun–vie (`api/v1/capacity/service.ts:17`), y `libresHoy` se busca por `find` de esa lista (`dia/service.ts:242-244`). Un sábado: ninguna pestaña activa, `libresHoy = 0`, `capacidadHoy < 0` y `DiaBoard.tsx:687-692` grita "Sobrecargado X h de ~0 h libres". Repro: abrir `/dia` en sábado con cualquier bloque.
- **Media — jornada mentida.** `DiaBoard.tsx:331` imprime `Jornada 09–18` literal, mientras el service lee `user.horarioInicio/horarioFin` reales (`service.ts:59-62`).
- **Media — hora del dispositivo vs. día del servidor.** `nowHHMM` usa `getHours()` local (`DiaBoard.tsx:256-259`); el día viene de `America/Mexico_City` (`lib/dates.ts:59-60`). Con el iPad en otra zona, "Ahora", el "siguiente bloque" y el auto-archivado de juntas (`DiaBoard.tsx:542`) se desfasan.
- **Alta — no hay red de seguridad.** No existe ningún `error.tsx` en `src/app`. Cualquier `throw` de server action (p. ej. `service.ts:363`, `delegacion-service.ts:11`) revienta la pantalla en lugar de mostrar el mensaje, ya escrito en español.

**Quick fixes.** (a) Pasar `horarioInicio/Fin` como props y formatear la etiqueta. (b) Añadir `src/app/(app)/error.tsx` con reintento. (c) En `page.tsx:40`, si `selectedDay` no está en `tabs`, añadirlo como pestaña extra y tratar `libresHoy` como jornada completa menos juntas.

**UX (M/P).** Envolver acciones en un helper `accion()` con `try/catch` + toast — el patrón ya existe en `CierreBoard.tsx:87-97`; portarlo a `/dia` (M). Marcar en las pestañas los días con cierre pendiente (S).

**Nuevos.** Barra con "días sin cerrar" enlazada a `/cierre?dia=` — PRODUCT.md dice que la compuerta de 14 días es la única salida del módulo, y hoy depende de que Mau recuerde entrar.

---

## 2. Franja AHORA y cronómetro

**Qué hace bien.** Una sola acción primaria, cronómetro de 44 px en mono, `/focus` como salida. El `bloqueActual` compartido evita la doble marca.

**Bugs**
- **Media — `taskId!` sin red.** `DiaBoard.tsx:1233`, `:1250`, `:1265` y `:1698-1702` asumen que todo bloque `tipo: 'tarea'` trae `taskId`. Un bloque de tarea suelto (los hay: `service.ts:98` contempla `b.done` sin task) tira la acción sin mensaje.
- **Media — rojo falso.** `over = seconds > current.planMin * 60` (`:1190`): con `planMin = 0` (ver §4) el cronómetro nace en rojo al primer segundo.
- **Baja/a11y — DoD sin label.** `:1281-1287` y `:1991-1998`: checkbox nativo (~13 px) sin `<label>`; en iPad se falla y el texto no es clickeable.

**Quick fixes.** Envolver cada ítem DoD en `<label className="flex ...">`; ocultar ▶/⏱ cuando `taskId === null`; usar `planMin > 0 && seconds > planMin*60`.

**UX (S/M).** "Reanudar" no dice cuánto lleva acumulado fuera de la cifra grande — mostrar `restan 0:35` (S). Confirmación al parar un cronómetro de más de 4 h, que es el patrón de "cronómetro olvidado" que `setMeasuredMinutes` existe para reparar (S).

**Nuevos.** Auto-pausa por inactividad con propuesta de corrección al volver (usa `setMeasuredMinutes`, ya escrito) — ataca directo la causa `trabajo_sin_cronometro` que domina el patrón de `/cierre`.

---

## 3. Timeline, drag & drop y menú ⋯

**Qué hace bien.** El handle `⋮⋮` como único activador táctil con `touch-action: none` acotado (`:1724-1737`) es la decisión correcta para iPad; `detectarColision` resuelve fila-sobre-contenedor; el menú flotante en portal con volteo probado sin navegador.

**Bugs**
- **Media/alta — descartar borra evidencia.** `dnd-actions.ts:373-385` hace `block.delete`. El planeado del día se calcula leyendo bloques por fecha (`cierre/service.ts:109-113`), así que descartar a media tarde reduce retroactivamente `planMin` y el hueco del cierre. Es la misma clase de error que la regla 11 de `CLAUDE.md`.
- **Media — mover a sábado = desaparecer.** `moveTargets` ofrece 7 días corridos incluyendo fin de semana (`DiaBoard.tsx:391-404`) y `weekForDate` crea la semana; pero `/dia` solo pinta lun–vie, así que el bloque se vuelve invisible hasta que aparece como "arrastrada".
- **Baja — reglas inconsistentes.** El menú prohíbe días pasados, el drop sobre pestaña no (`:488-493`): se puede agendar a un día ya vencido.
- **Baja — comparador inestable.** `dnd-actions.ts:245`: `(a.id === blockId ? -1 : 1)` no es simétrico; con dos bloques empatados en `start` el orden depende del motor.
- **Media — acciones mudas.** `reflowTodayAction` devuelve `{reflowed, fueraDeJornada}` y `DiaBoard.tsx:733` lo tira; `startDayAction` sale con `{synced: 0}` si no hay `icsUrl` (`actions.ts:70`) sin decir nada. Dos botones que nunca confirman nada.
- **Táctil (iPad) — bajo 44 px.** ▶/✓ 36 px (40 en `lg`) `:1772`, `:1782`; `MinutaBoton` ~24 px `:1306-1316`; ✓/✕ de `CampoEnLinea` ~16 px (`components/inline-controls.tsx:143,152`); select "Agendar a…" ~18 px (`:1046-1055`).
- **Media — `pending` global.** Un solo `useTransition` (`:456`) congela toda la pantalla en cada clic; con red mala en iPad se siente colgada.

**Quick fixes.** Subir ▶/✓/⋯ a `h-11 w-11`; dar `min-h-[44px]` a las filas del menú y `p-2` a ✓/✕; filtrar fin de semana en `moveTargets`; en `descartarTareaAction` conservar el bloque con `done` + estatus `deferred` en vez de borrarlo; mostrar el resultado de `reflowTodayAction` en la barra.

**UX (M).** Deshacer de 5 s tras mover/descartar/reordenar (M) — hoy toda acción de DnD es irreversible sin rehacer a mano.

**Nuevos.** Reflow como *propuesta* revisable ("mueve 3 bloques, 1 queda fuera de jornada — aplicar") en vez de escritura directa: es literalmente el principio 2 de PRODUCT.md, "la IA propone, el humano dispone", aplicado al único algoritmo que hoy reescribe el día solo.

---

## 4. Pendientes, Nueva actividad, Briefing y Minuta

**Qué hace bien.** Capturar sin salir del día; el ajustado por factor mostrado *antes* de guardar (`:1471-1475`) es la mejor pieza pedagógica de la pantalla. El briefing colapsa por fecha, no para siempre.

**Bugs**
- **Media — actividad de 0 minutos.** `nueva-actividad.ts:90` usa `planMin: ajustadoMin ?? 0`, mientras el mismo gesto por drag usa `?? 60` (`dnd-actions.ts:77`). Sin estimado, el bloque nace en `0:00`: no suma a Planeado, no cuenta en capacidad y sale rojo al cronometrar.
- **Media — "Agendar" que no agenda.** Si no existe `Week` para esa fecha, `nueva-actividad.ts:64-69` cae a backlog y devuelve `block: null`; la UI cierra el formulario igual (`DiaBoard.tsx:1385-1401`), sin avisar.
- **Media — se pierde lo escrito.** `guardar()` llama `limpiar()` fuera del `await`: si la acción falla, el texto ya no está.
- **Media/seguridad — HTML sin sanear.** `MinutaDrawer.tsx:500-504` pinta `textoRich` con `dangerouslySetInnerHTML`; TipTap acepta pegado desde Outlook/Word y nada filtra atributos de evento. En una app multiusuario (segundo anillo de PRODUCT.md) eso es XSS almacenado.
- **Media/a11y — drawer sin diálogo.** `:252-254`: sin `role="dialog"`, sin `aria-modal`, sin Escape ni trampa de foco; el velo es un `<div>` clickeable.
- **Baja — minuta duplicable.** `cargando` arranca en `!!block.minutaId` (`:67`); si la minuta se creó en otra pestaña, el drawer no la carga y crea una segunda.

**Quick fixes.** `planMin: ajustadoMin ?? estimadoMin ?? 60`; lanzar si `agendar && !week`; mover `limpiar()` dentro del éxito; sanear con `sanitize-html` en `guardarItemAction` (`minuta-actions.ts:136-146`), no al pintar; añadir `role="dialog"` + `onKeyDown` Escape.

**UX (S/M).** Buscador en Pendientes cuando pasan de ~15 (S). Cerrar el drawer con Escape y confirmar antes de descartar texto sin guardar (S).

**Nuevos.** Nudge de minuta activo: hoy `NudgeMinuta` solo aparece en la sección "Terminadas", que está colapsada por default (`:719-723`) — subirlo al briefing del día siguiente cierra el ciclo junta → acuerdo → Task del que vive la Fase 7.

---

## 5. Cierre del día (`/cierre`)

**Qué hace bien.** El snapshot antes de mover, con su comentario, es la corrección correcta del incidente del 13-ago. El manejo de errores (`accion()`) y la ownership de `stakeholderId`/`taskId` (`actions.ts:38-50`) están mejor resueltos que en `/dia`. Los textos no juzgan: cumplen el tono de PRODUCT.md.

**Bugs**
- **Alta — medido inflado en tareas arrastradas.** `cierre/service.ts:147` (y `:324`) suma **todos** los `timeEntries` de la tarea, sin filtrar por fecha. Una tarea trabajada ayer y movida a hoy trae su tiempo de ayer: el hueco de hoy se subestima y ese minuto se cuenta dos veces en dos cierres. Repro: cronometrar 60 min hoy, pasar el pendiente, abrir el cierre de mañana.
- **Alta — el desvío promovido ensucia la señal JD-R.** `cierre/service.ts:420,439-447` crea el `TimeEntry` con `startedAt = new Date('YYYY-MM-DD')` = medianoche UTC = **18:00 del día anterior** en México; `carga-sostenible.ts:141,171` lo cuenta como fuera de jornada (y si la fecha es lunes, como domingo). Además `seconds` no coincide con `stoppedAt - startedAt`, justo la incoherencia que `service.ts:340-344` corrigió en `/dia`.
- **Alta — doble registro del mismo trabajo.** `guardarCierreAction` borra y recrea los desvíos (`actions.ts:59`) y `promovidas` es estado local (`CierreBoard.tsx:79,289-303`). Tras recargar, el botón "Registrar estos N min" reaparece y `convertirDesvioEnTarea` no es idempotente: se duplica en el ledger Aliado.
- **Media — "✓ guardado" engañoso.** `accion()` pone `guardado = true` también al mover pendientes (`:394-396`), aunque el cierre siga sin guardarse.
- **Media — sin tope de minutos.** `actions.ts:34` solo filtra `> 0`: un dedazo de 3000 min domina la ventana de 14 días.
- **Baja — ventana mal etiquetada.** El título dice "últimos 14 días" (`CierreBoard.tsx:408`) pero la ventana es relativa al día visto (`page.tsx:18`).
- **DESIGN.md.** `A_QUIEN_TOCA_COLOR` (`:20-24`) usa `warn` como chip decorativo — prohibido explícitamente — y un morado `#5b4b8a` fuera de tokens; `h1 text-2xl` (`:106`) y `bg-brand-deep/5` (`:507`) contradicen la gramática de `/dia`. Flechas ← → sin `aria-label` y de ~24 px (`:119-125`); no hay regreso a `/dia`.

**Quick fixes.** Filtrar `timeEntries` por `startedAt` dentro del día; fijar `startedAt` a las 12:00 hora MX del día del desvío y `stoppedAt = startedAt + seconds`; guardar `taskId` creado en el `Desvio` para bloquear la re-promoción; tope de 960 min por renglón; `aria-label` en las flechas; sustituir el morado por un token.

**UX (M).** Precargar renglones desde señales reales (junta que se alargó vs. calendario, bomberazo detectado por TimeEntry sin bloque): el contrato es 60 s y hoy son ~5 campos por desvío.

**Nuevos.** (a) Cierre en cola: lista de días sin reconciliar de los últimos 14, con un cierre por pantalla. (b) Empujar el patrón dominante a `/semana` para que el factor se calibre con la causa, no solo con el ratio — es la salida de la compuerta que PRODUCT.md describe y hoy muere en esta pantalla.

---

## Top 10 priorizado (impacto × esfuerzo)

| # | Hallazgo | Archivo | Esfuerzo |
|---|---|---|---|
| 1 | `medidoMin` suma TimeEntries de otros días → hueco falso y doble conteo | `cierre/service.ts:147,324` | S |
| 2 | `TimeEntry` sintético a medianoche UTC contamina la señal de erosión | `cierre/service.ts:420,439-447` | S |
| 3 | Sin `error.tsx`: los mensajes de error escritos nunca se ven | `src/app/(app)/` | S |
| 4 | Doble registro de trabajo promovido (no idempotente) | `CierreBoard.tsx:289-318` + `actions.ts:59` | M |
| 5 | Fin de semana: sin pestaña y alerta falsa de sobrecarga | `page.tsx:40` + `DiaBoard.tsx:687` | S |
| 6 | Blancos táctiles <44 px en iPad (▶/✓/⋯, ✓/✕ del menú, selects) | `DiaBoard.tsx:1772,1782,1306`; `inline-controls.tsx:143,152` | S |
| 7 | Descartar borra el bloque y altera el planeado del cierre | `dnd-actions.ts:373-385` | S |
| 8 | `textoRich` sin sanear en `dangerouslySetInnerHTML` | `MinutaDrawer.tsx:500-504` | S |
| 9 | Actividad sin estimado → bloque de 0 min invisible en capacidad | `nueva-actividad.ts:90` | S |
| 10 | Botones mudos: "Arrancar día" / "Actualizar juntas" sin feedback | `DiaBoard.tsx:364-372,733` | S |

---

# QA — WTW App · `/semana`, `/inbox`, `/historico`, `/resumen`

Revisión solo-lectura contra `CLAUDE.md`, `PRODUCT.md` y `DESIGN.md`. Contexto: usuario único experto, iPad como pantalla principal, "instrumento, no dashboard".

---

## 1. `/semana` — el lienzo (`SemanaBoard.tsx`, `lienzo.ts`, `service.ts`, `actions.ts`)

**Qué hace bien.** `lienzo.ts` es geometría pura y testeable; `repartirCarriles` resuelve traslapes por grupo (no por día) y está bien razonado. El doble candado de propiedad en `service.ts:130` es correcto. La regla anti-hidratación se respeta (`ahoraMin` arranca en `null`, `SemanaBoard.tsx:116`) y el `DndContext` lleva `id` estable (`:301`). "Fuera de jornada" como lista y no como rejilla estirada es la decisión correcta.

**Bugs / riesgos.**

1. **ALTA — Soltar en Flex o en la cabecera del día no quita la hora.** `SemanaBoard.tsx:231` manda `hora = null` para `flex:`/`head:`, y `moverBloqueAction` (`semana/actions.ts:41-49`) solo llama `moveBlockAction`, que únicamente escribe `fecha/weekId/orden` (`dia/dnd-actions.ts:94-97`). Pero el optimista de `:245` pinta `inicio:'flex', ubicacion:'flex'`. *Repro:* arrastra un bloque de 10:00 a la franja Flex del miércoles → aparece como chip flex y ~500 ms después salta de vuelta al grid a las 10:00. El comentario de `:353` ("zona de drop a este día, sin hora") describe algo que no ocurre.
2. **ALTA — Las juntas de Outlook son inoperables en iPad.** El disparador del `MenuFlotante` es `opacity-0 … group-hover:opacity-100` (`SemanaBoard.tsx:788`). Sin hover no hay descubrimiento: "No me quita tiempo" y "Cancelada" no existen en la pantalla principal de Mau. Mismo patrón en el handle de resize (`:838`, `h-2.5` = 10 px, `opacity-0 group-hover`).
3. **MEDIA — El fantasma miente sobre la hora de destino.** `setBlockTimeAction` (`dia/dnd-actions.ts:247-254`) reempaqueta secuencialmente todo el día: si hay un bloque 09:00–10:00 y sueltas otro a las 09:30, el preview dice "→ 09:30" y el server lo escribe a las 10:00, sin aviso.
4. **MEDIA — `getHistorico` sin límite en el camino caliente.** `semana/service.ts:150` lo llama en cada carga del lienzo, y `historico/service.ts:15-19` trae *todas* las semanas cerradas más un `findMany` de `TimeEntry`. A 52 semanas la sparkline del pie deja de leerse y el TTFB de la pantalla más usada sube por datos colapsados.
5. **MEDIA — Captura fantasma en la bandeja.** `onBlur={capturar}` (`SemanaBoard.tsx:522`): tocar cualquier otra cosa con texto a medias crea una tarea. En iPad el blur ocurre al empezar un arrastre o al abrir el teclado.
6. **BAJA — "Ahora" en hora del dispositivo.** `SemanaBoard.tsx:144-145` usa `d.getHours()`, no `nowMinutesMx()`. Con el iPad en otro huso, la línea roja se corre contra bloques guardados en hora de México.
7. **BAJA — Juntas externas focusables sin acción.** `:762` esparce `attributes` (role=button, tabIndex) incluso cuando no hay `listeners` (`:763`). Tab recorre cada junta y no pasa nada.

**Quick fixes (≤1 h).**
- `semana/actions.ts:41` — si `hhmm === null`, escribir `inicio:'flex', fin:'flex'` en un `prisma.block.update` tras mover; o bien no marcar `flex` en el optimista.
- `SemanaBoard.tsx:788` y `:838` — cambiar `opacity-0 group-hover:opacity-100` por `opacity-100 lg:opacity-0 lg:group-hover:opacity-100` y subir el handle a `h-6` con `after:` invisible de 44 px.
- `SemanaBoard.tsx:522` — quitar `onBlur`; dejar Enter y un botón "+".
- `SemanaBoard.tsx:144` — usar `nowMinutesMx()` de `@/lib/dates`.
- `historico/service.ts:18` — `take: 12` (+ parámetro opcional para `/historico`).

**UX (medio plazo).** (a) Feedback cuando el server reubica el drop — un flash del bloque en su hora final, **S**, porque hoy el lienzo enseña un número que no cumple. (b) Deshacer de 5 s tras mover/desagendar, **M**: el arrastre es el gesto más fácil de errar con el dedo. (c) Navegación entre semanas (hoy solo se ve la semana en curso; `getLienzoSemana` ya recibe `isoWeek`), **S**.

**Desarrollos nuevos.** Exportar la semana como `.ics` — el código ya sabe que "un bloque que cruza medianoche rompía el .ics" (`dnd-actions.ts:22-26`), así que la salida existía y se perdió. Encaja con "demostrar en automático el rol que ya ejerce" de PRODUCT.md.

---

## 2. `/semana/nueva` — el ritual de 5 pasos

**Qué hace bien.** La compuerta de carga se revalida en servidor con el mismo factor con el que escribe (`actions.ts:76-81`) — el buffer deja de ser decorativo. El muro de "ya planeada" nombra sus tres salidas. `borrar.ts` conserva las horas medidas. Las medidas del pre-mortem se derivan de `draft.items` en vez de un set paralelo (`PlaneadorSemanal.tsx:182-193`).

**Bugs / riesgos.**

1. **ALTA — El draft de localStorage no está escopado por semana ni por usuario.** `DRAFT_KEY` es constante (`:16`) y `leerDraft` lo devuelve sin comparar contra `ctx.isoWeek` (`:82-93`). *Repro:* empieza a planear W38, sal, entra a `/semana/nueva?semana=W39` → aparece el ritual de W38 con el backlog de otra semana; el botón final escribe en W39 (`:551`).
2. **ALTA — La IA del paso 1/2/5 mira una semana distinta a la que se planea.** `recapAction`, `sugerirWinsAction` y `premortemAction` llaman `contextoPlaneacion(userId)` **sin** `isoWeek` (`ai-actions.ts:106, 120, 241`), así que caen en `semanaPorDefecto`. Planeando W40 por URL, el AAR redacta sobre la anterior a W38.
3. **MEDIA — El borrado revive tareas terminadas.** `borrar.ts:33-36` hace `updateMany` con `estatus:'backlog'` sobre **todas** las tareas de la semana, incluidas las `done`. Borrar y replanear devuelve trabajo cerrado al backlog e infla el vaciado del paso 3.
4. **MEDIA — Blancos táctiles del paso 3.** La fila de `PasoVaciar` (`:1029-1124`) tiene checkbox nativo (~14 px), `input number` `w-16 py-0.5` (~22 px) y tres `select` `py-0.5 text-xs`. Es el paso más largo del ritual y el que se hace en iPad.
5. **MEDIA — `isoWeekValida` acepta semanas imposibles.** `service.ts:92-96` solo valida `\d{4}-W\d{2}`: `?semana=2026-W00` o `W99` crea un `Week` real con rango basura.
6. **BAJA — Refs colisionables.** `:403` genera `n${items.length+1}-${titulo.slice(0,8)}`; agregar/quitar items puede repetir el `ref` que `createWeekPayload` usa como `taskRef` para colgar el bloque.
7. **BAJA — El draft se borra antes de confirmar.** `:549` hace `removeItem` antes del `await`; si la pestaña muere durante la llamada se pierden los 10 min (el `catch` de `:566` solo cubre el rechazo).
8. **BAJA — Gramática de color.** `border-warn-border` permanente en el input "Desbloqueador" (`:1372`) y el chip `bg-[#5b4b8a]` "viene de antes" (`:1038`) violan "un color, un significado" y "el acento no pasa del 10%" de DESIGN.md.

**Quick fixes.** Guardar `{isoWeek, draft}` y descartar si no coincide (`:82`); pasar `ctx.isoWeek` a las tres AI actions; excluir `estatus:'done'` del `updateMany` de `borrar.ts:33`; validar `W01–W53` en el regex; mover `removeItem` a después del `await`; `ref` con `crypto.randomUUID()`.

**UX.** (a) Altura mínima 44 px y `inputMode="numeric"` en el paso 3, **S**. (b) Guardar el draft también en servidor por `isoWeek`, **M** — el ritual se hace en iPad y se retoma en Mac. (c) Diff antes de "Crear semana": qué se adopta, qué nace, qué queda en backlog, **M**.

**Desarrollos nuevos.** Cerrar el ciclo del pre-mortem dentro del ritual: `VeredictoPremortem` ya se calcula y se muestra, pero nadie marca `ocurrio`/`defensaFunciono` desde la app — sin eso la predicción nunca se calibra, que es la tesis del 360 en PRODUCT.md.

---

## 3. `/inbox`

**Qué hace bien.** El etiquetado en lote resuelve exactamente la "disciplina PMO que su dueño detesta". La sugerencia se propone y el humano confirma (`InboxBoard.tsx:339-355`). El estado vacío enseña en vez de informar (`:392-401`). `etiquetarClases` re-escopa por `userId` (regla 4).

**Bugs / riesgos.**
1. **MEDIA — Captura silenciosa que falla.** `submit()` dispara la action y llama `reset()` inmediatamente (`:103-113`); no hay estado de error. Si la action lanza, el formulario ya se vació y el usuario no se entera.
2. **MEDIA — "Descartar" destructivo, sin confirmación y con blanco de ~16 px** (`:366-372`), pegado al título. El resto de la app usa doble clic (`PlaneadorSemanal.tsx:276`). Un roce en iPad manda la tarea a `deferred`, invisible desde la UI.
3. **BAJA — Revalidación incompleta.** `discardAction` (`inbox/actions.ts:41-44`) solo revalida `/inbox`; la bandeja de `/semana` y el parking lot de `/dia` quedan mostrando la tarea.
4. **BAJA — `grid-cols-2` con tres selects** (`:148`) deja un hueco permanente; y `disabled={pending}` en todo el formulario lo congela mientras se descarta otra tarea.

**Quick fixes.** Envolver `captureAction` en try/catch con `role="alert"` y no limpiar hasta el éxito; doble clic + `min-h-11` en Descartar; agregar `revalidatePath('/dia')` y `('/semana')` a `discardAction`; `sm:grid-cols-3`.

**UX.** (a) Deshacer de 5 s en Descartar, **S**. (b) Captura por voz / share-sheet desde el wrapper nativo, **M** — la bandeja vive de lo que llega entre juntas. (c) Límite y paginado en `sugerenciasDeClase` (hoy trae *todo* el backlog sin clase, `service.ts:74-78`), **S**.

**Desarrollos nuevos.** Captura desde Mail/Slack vía Share Extension del wrapper iOS: `createInboxTask` ya acepta todo el payload; falta el punto de entrada.

---

## 4. `/historico`

**Qué hace bien.** `Sparkline` sin librería, con huecos que cortan el tramo en vez de interpolar (`Sparkline.tsx:173-186`) — honestidad de datos, principio 4. `TrendCard` compara contra el último dato conocido, no contra la posición anterior.

**Bugs / riesgos.**
1. **MEDIA — "Plan" significa dos cosas distintas.** `minutosPlaneados` suma **todos** los `Block.planMin` incluidas juntas y descansos (`service.ts:26-30`), mientras el paso 1 del planeador define plan como suma de `ajustadoMin` de tareas (`nueva/service.ts:188`). La misma semana da dos "plan" distintos en dos pantallas.
2. **BAJA — Sparkline invisible para lector de pantalla:** `<svg>` sin `role="img"` ni `aria-label` (`Sparkline.tsx:211`).
3. **BAJA — La tabla no tiene contenedor `overflow-x-auto`** (`page.tsx:124`): en iPhone empuja el scroll horizontal de toda la página.
4. **BAJA — Sin límite ni rango:** la tabla crece indefinidamente y no hay filtro por trimestre.

**Quick fixes.** `role="img"` + `aria-label` con el resumen numérico; envolver la tabla en `overflow-x-auto`; renombrar la columna a "Horas (medidas / bloqueadas)" o filtrar `tipo:'tarea'` en el `groupBy`.

**UX.** (a) Selector de ventana (8 / 12 / todas), **S**. (b) Anotar la semana en la que cambió el factor manual, **M** — la tendencia sin la causa no decide nada.

**Desarrollos nuevos.** Serie de "% fuera de jornada" junto a las tres actuales: la señal ya existe en `carga-sostenible` y el lienzo la muestra puntual; como tendencia es la métrica de erosión de frontera que PRODUCT.md nombra sin instrumentar.

---

## 5. `/resumen`

**Qué hace bien.** El ensamblador es determinista y guarda `insumos` para auditar (`actions.ts:93-105`). El par borrador/final nunca se sobrescribe. `MetricasIA` cierra el flywheel: qué IA se queda se decide con datos.

**Bugs / riesgos.**
1. **ALTA — Crash desde un campo de texto libre.** La semana ISO se teclea sin validación (`ResumenBoard.tsx:172-180`) y `ensamblarResumen` corre **fuera** del `try/catch` (`actions.ts:76`, el `try` abre en `:81`). `weekRange("2026-33")` produce fechas `NaN` → la Server Action rechaza sin capturar → error boundary.
2. **MEDIA — Ediciones perdidas sin aviso.** Cargar un resumen previo (`:270-274`) o generar uno nuevo (`:75`) sobrescribe `texto` aunque haya cambios sin guardar.
3. **MEDIA — "Copiar" marca `enviado` aunque falle.** `void navigator.clipboard.writeText(texto)` sin `await` ni `catch` (`:220-222`) y sin confirmación visible; la métrica de aceptación se contamina.
4. **BAJA — Fecha de los previos corrida.** `page.tsx:50` usa `createdAt.toISOString()`; después de las 18:00 CDMX muestra el día siguiente — el mismo bug que `todayStr()` documenta en `dates.ts:56-58`.
5. **BAJA — Blancos táctiles:** chips de alcance `py-1 text-xs` (~26 px) y botones Copiar/Guardar `py-1` (`:224`, `:241`).

**Quick fixes.** Mover `ensamblarResumen` dentro del `try` y validar `isoWeek` con `isoWeekValida`; cambiar el input de semana por `<select>` de las últimas 12; `try/await` en el copy con toast; `todayStr(a.createdAt)` en `page.tsx:50`.

**UX.** (a) Confirmar antes de pisar una edición sin guardar, **S**. (b) Diff borrador↔final visible, **M** — es el insumo del aprendizaje y hoy solo se ve el número agregado. (c) Autosave del textarea en localStorage, **S**.

**Desarrollos nuevos.** Enviar el resumen a Slack en la voz de Mau reusando el ensamblador y el skill `status-mau`: PRODUCT.md pide "demostrar en automático el rol", y hoy el último tramo es copiar y pegar a mano.

---

## Top 10 priorizado (impacto × esfuerzo)

| # | Hallazgo | Archivo:línea | Sev. | Esf. |
|---|---|---|---|---|
| 1 | Soltar en Flex/cabecera no quita la hora (optimista miente) | `semana/actions.ts:41` · `SemanaBoard.tsx:245` | Alta | S |
| 2 | Menú de juntas y handle de resize invisibles/inalcanzables en iPad | `SemanaBoard.tsx:788, 838` | Alta | S |
| 3 | Draft del planeador global, no por semana | `PlaneadorSemanal.tsx:16, 82` | Alta | S |
| 4 | IA del ritual lee una semana distinta a la planeada | `nueva/ai-actions.ts:106, 120, 241` | Alta | S |
| 5 | Crash de `/resumen` por ISO week libre fuera del try | `resumen/actions.ts:76` · `ResumenBoard.tsx:174` | Alta | S |
| 6 | Borrar semana revive tareas `done` al backlog | `nueva/borrar.ts:33-36` | Media | S |
| 7 | "Descartar" y captura del inbox: destructivo sin confirmación, error silencioso | `InboxBoard.tsx:103, 366` | Media | S |
| 8 | Blancos táctiles < 44 px en el paso 3 y en la ayuda "?" | `PlaneadorSemanal.tsx:1029-1124` · `ayuda-contextual.tsx:102` | Media | M |
| 9 | `getHistorico` sin límite dentro de `getLienzoSemana` | `semana/service.ts:150` · `historico/service.ts:18` | Media | S |
| 10 | El drop se reubica en cascada sin decírselo al usuario | `dia/dnd-actions.ts:247-254` | Media | M |

---

# QA — WTW App: Carrera, Stakeholders, Equipo, Proyectos, Aliado, ROI

Revisión solo-lectura. Todas las líneas citadas están verificadas contra el código.

## Hallazgos transversales (aplican a todo el alcance)

**T1 — Auto-zoom de iOS en cada input. Alta.** `src/app/layout.tsx:27` declara `viewport` solo con `themeColor`; no hay `maximum-scale`. Todos los campos usan `text-sm` (14px) o `text-xs` (12px) — p. ej. `DesarrolloBoard.tsx:50` (`CAMPO`), `inline-controls.tsx:136`. Safari hace zoom automático al enfocar cualquier input <16px. En el iPad (dispositivo principal) cada tap en un campo desencaja la página y hay que despinchar. Fix correcto: subir los inputs a 16px, **no** bloquear el pinch-zoom.

**T2 — Blancos táctiles muy por debajo de 44px. Alta.** No existe ninguna convención de 44px en el repo (grep sobre `src/`: los dos únicos hits son anchos de columna de grid). Casos verificados: `ayuda-contextual.tsx:102` el disparador "?" es **18×18px** y es la única forma de entender el modelo mental de la pantalla; `inline-controls.tsx:140,149` los botones ✓ y ✕ son glifos `text-xs` sin padding (~12px) separados por 4px — errar el tap **descarta lo tecleado sin confirmación**; `CatalogoSection.tsx:33` (`px-2 py-0.5`, ~18px) apila "empezar/hecho/no aplica"; `DesarrolloBoard.tsx:48,558,996`; y en stakeholders **todos** los controles (selects `py-0.5` en `StakeholdersBoard.tsx:474,498,527,598,614,657,693`, checkboxes ~14px en `:627,638`).

**T3 — Los mensajes de error en español no llegan al usuario en producción. Media-alta.** `next.config.ts` está vacío; Next 16 redacta los errores lanzados dentro de Server Actions. Todo `throw new Error('la evidencia necesita una nota')` (`desarrollo/actions.ts` ×6, `literatura-service.ts:62,63,93`, `evidence/service.ts:21,30`) se pinta en el recuadro rojo como una cadena opaca en inglés. **El repo ya resolvió esto**: `proyectos/[id]/evidencia-actions.ts:27-29` usa la unión `{ ok: false; error }` y su comentario dice literalmente *"Nunca lanza hacia la UI"*. Es adoptar un patrón existente, no inventarlo.

**T4 — `toISOString().slice(0,10)` sobre timestamps reales. Media.** `dates.ts:56-58` documenta el bug (México es UTC-6) y ofrece `todayStr()`. Reincidencias: `caso/service.ts:91` (fecha del one-pager), `caso/service.ts:103` y `proyectos/[id]/service.ts:30` (`ImpactoEntregable.fecha` es `DateTime @default(now())`, schema:420 — no `@db.Date`), `literatura-service.ts:39`, `desarrollo/page.tsx:29`, `EntregablesSection.tsx:105`. Repro: registrar cualquier cosa después de las 18:00 CDMX → aparece fechada mañana. En `/caso` es un documento que va al comité con la fecha equivocada.

---

## Carrera (`/desarrollo`)

**Bien.** El semáforo patrón/anécdota y el umbral de 3 con alerta de concentración (`service.ts:131-150`) son la traducción correcta de "el comité evalúa un patrón". `siguientePasoDe` (`:154`) devuelve **una** acción, no una lista. `getDesarrollo(userId, hoy)` recibe `hoy` como parámetro: testeable y sin mismatch de hidratación.

**Bugs.**
- `desarrollo/service.ts:468` — `desde: tareas[tareas.length-1].createdAt` sobre una consulta con `orderBy: { updatedAt: 'desc' }` (`:438`). El último elemento es el **menos recientemente actualizado**, no el más antiguo. La bitácora dice "23h desde <fecha falsa>" — y esa frase es el caso de negocio para pedir un reporte. Repro: marcar delegable una tarea vieja y luego editar otra. **Media.**
- `DesarrolloBoard.tsx:328` — `href={rec.url ?? '#catalogo'}` ancla a `:1090`, que envuelve `CatalogoSection`, cuyo `Seccion` es `defaultAbierto={false}` (`CatalogoSection.tsx:225`). El recurso sin URL lleva a una fila colapsada: callejón sin salida. **Media.**
- `actions.ts:72-78` — al volver un recurso a `pendiente` no se limpian `iniciado` ni `terminado`; `practicarRecursoAction` (`:93`) fuerza `estado: 'en_curso'` y resucita en silencio lo marcado `hecho`/`descartado`. **Baja.**
- `DesarrolloBoard.tsx:816-822` — el aviso al usuario cita la ruta interna `prisma/seed-data/reactivos-nivel.ts`. **Baja.**
- `caso/service.ts:55` — `Number(b.testigo !== null)` trata `testigo: ''` como testigo válido, mientras `unicos()` (`service.ts:119`) lo descarta. Las dos vistas discrepan. **Baja.**
- `BotonImprimir.tsx:11` — `shadow-sm` y `text-white` violan DESIGN.md (cero sombras; el token es `text-surface`), y el `fixed bottom-4 right-4` tapa la última línea en iPad. **Baja.**

**Quick fixes.** `service.ts:468` → `orderBy: [{ createdAt: 'asc' }]` en una consulta aparte o `Math.min` sobre los `createdAt`. `caso/service.ts:91` → `todayStr(hoy)`. `CatalogoSection.tsx:225` → `defaultAbierto` desde la URL (`#catalogo` lo abre). `BotonImprimir.tsx:11` → quitar `shadow-sm`, `text-surface`, `sticky` en vez de `fixed`.

**UX (medio plazo).** Sustituir el "?" de 18px por un disparador de 44px con el mismo glifo (S). "hace 0d" debería decir "hoy" (S). El registro de evidencia pide competencia + nota + testigo + nivel en un formulario de 4 campos: contradice "si un ritual se vuelve formulario, deja de hacerse" — un tap desde la tarea recién cerrada sería el camino real (M).

**Nuevo.** Recordatorio de cadencia de evidencia comprobado contra el estado real (principio 3 de PRODUCT.md): "el reactivo 10 lleva 60 días sin pieza". Y ligar `Evidence` a `StakeholderInteraccion` para que el testigo salga del mapa en vez de escribirse a mano.

---

## Stakeholders

**Bien.** `hoyISO()` usa `todayStr()` (`StakeholdersBoard.tsx:59`). El orden de "Por contactar" es por retraso **relativo** a la cadencia, no por antigüedad.

**Bugs.**
- `service.ts:187` — **`NaN` en el health score. Alta.** Ninguna acción valida `cadenciaDias`; `rango()` (`actions.ts:12`) solo protege poder/interés. Repro: campo "Cada" → `0` → blur (`StakeholdersBoard.tsx:668-680` → `actions.ts:104`). Con `diasSinContacto = 0` sale `0/0 = NaN` y el badge (`:424`) imprime **"NaN · sana"**.
- `service.ts:180-183` — **la asimetría 3:1 se anula. Alta.** Un contacto con `variableConfianza` **y** `esIncumplimiento` cuenta en las dos listas: neto −2, no −3. La UI permite ambos (select `:494` y toggle `:512` sin exclusión).
- `StakeholdersBoard.tsx:463` / `actions.ts:148` — **fechas futuras. Alta.** Sin `max` ni validación: `dias()` negativo → `decay = 0`, `cadenciaVencida = false`, y la ficha dice "hace −12d". Un campo vacío da `new Date('')` = Invalid Date → error crudo de Prisma.
- `actions.ts:178` — `borrarInteraccionAction` **existe y no está cableada. Alta.** Un incumplimiento marcado por error pesa 3× durante 90 días y es irreversible desde la app.
- No se puede editar `nombre`, `puesto`, `queNecesita` ni `notas` (`actions.ts:72,79` los acepta; ninguna UI los manda). Corregir un typo obliga a borrar, y el borrado arrastra las interacciones en cascada (schema:553) sin decirlo (`:706-718`). **Alta.**
- `:29` `desconocida: 'bg-warn-soft text-warn'` — DESIGN.md: *"warn solo advertencias, nunca un chip decorativo"*. `:185-209` cuatro cajas iguales en rejilla **sin ejes rotulados** es el anti-referente literal de PRODUCT.md. **Media.**
- `:420` — `title={TIER_NOTA[...]}` es la única explicación de "definitivo/expectante/latente", y `title` no existe en touch. **Alta en iPad.**

**Quick fixes.** `Math.max(1, …)` en `service.ts:174` + clamp en `actions.ts:60,104`; `!i.esIncumplimiento` en el filtro de positivos (`service.ts:181`); `max={hoyISO()}` + rechazo de `NaN`/futuro en `actions.ts:148`; botón `×` por interacción llamando a la action que ya existe; `desconocida: 'bg-hair text-faint'`; `aria-expanded` en `:414`.

**UX / nuevo.** `pending` por ficha en vez de global (S). Registro en un tap: "hoy, junta" con defaults (M). `StakeholderInteraccion.minutaId` existe en el schema (`:567`) y **nadie lo escribe** — proponer interacciones al clasificar una minuta cierra el ciclo (M).

---

## Proyectos

**Bien.** `getProyectoDetalle` (`[id]/service.ts:16`) valida propiedad y da el mismo mensaje para "no existe" y "no es tuyo".

**Bugs.**
- `[id]/service.ts:20` — **entregable vencido pintado en verde. Alta.** El semáforo exige `fechaProyectada && fechaComprometida`; con comprometida = ayer y proyectada = null sale "A tiempo" (`EntregablesSection.tsx:156`). Es justo la brecha de sobre-optimismo que PRODUCT.md dice atacar. Tampoco mira `d.estatus`.
- `api/v1/asignaciones/service.ts:12-16` — **`pctReal` histórico presentado como semanal. Alta.** `complianceForWeek` no filtra fechas; la columna "Asignación" (`ProyectosBoard.tsx:73`) compara toda la vida contra un objetivo semanal. Contradice "honestidad de datos sobre completitud".
- `StatusEquipoSection.tsx:78-80` — **se pierde el borrador editado. Alta.** "Generar status" sobrescribe `texto` sin confirmar; solo "Guardar borrador editado" persiste.
- `ProyectosBoard.tsx:53` — join **por nombre** (`l.projectNombre === p.nombre`); `aliado/service.ts:27-32` agrega por `projectId` pero lo descarta. Dos "Liverpool" mezclan horas. **Media.**
- `EntregablesSection.tsx:145,102` — `startTransition` sin try/catch tras mutar estado optimista: el ✓ queda puesto y la promesa rechazada sube al error boundary. `:139,97` — `useState(props)` que no se resincroniza tras `revalidatePath`. **Media.**
- `MinutasSection.tsx:59` — `dangerouslySetInnerHTML` sobre `textoRich` sin sanitizar. Hoy es self-XSS; con el segundo anillo de usuarios deja de serlo. **Media.**
- `dia/minuta-ai-actions.ts:100` — sin `revalidatePath`; por eso la UI pide *"Recarga para verlos"* (`MinutaClasificar.tsx:67`). `status-actions.ts:117` revalida `/proyectos` en vez de `/proyectos/${id}`. **Media.**
- `MinutaEvidencia.tsx:124` — `key={s.competencyId}` con `notas` por índice: dos sugerencias del mismo reactivo cruzan las notas. **Media.**
- `portal-actions.ts` **no se importa desde ningún archivo**: `/portal/[token]/page.tsx` y `Project.portalTokenHash` existen, pero no hay UI que emita ni revoque el token. **Alta (feature inaccesible).**

**Quick fixes.** Añadir `|| (fechaComprometida < hoy && avancePct < 100)` al semáforo; `desde`/`hasta` en `complianceForWeek`; confirmar antes de regenerar si `texto !== (activo.final ?? activo.borrador)`; devolver `projectId` en el ledger; try/catch en ambas transitions; link "Portal del cliente" (~20 líneas sobre código ya escrito).

---

## Equipo

**Bugs.** `equipo/actions.ts:7` — **sin validación de email ni control de rol. Alta**: cualquier autenticado (incluido un report) crea cuentas y se auto-asigna como manager; `EquipoBoard.tsx:28` hace `preventDefault()` y lee refs, así que `type="email"` nunca valida y `"abc"` pasa. `EquipoBoard.tsx:32-37` — `inviteColleagueAction` sin try/catch: el caso más probable ("ese correo ya tiene cuenta", `service.ts:13`) deja la UI colgada. **Alta.** `equipo/service.ts:30` — `isoWeekOf(new Date())` usa getters UTC (`dates.ts:1-9`): domingo 18:00–23:59 CDMX muestra los Wins de la semana siguiente. **Media.** `service.ts:40` — pasa modelos `Win` completos a un Client Component (regla 2 de CLAUDE.md). **Media.** `[reportId]/page.tsx:43-45` — toda fila con 0 evidencias va en ámbar: en un colaborador nuevo es el 100% de la pantalla, contra el "acento ≤10%" de DESIGN.md. Sin link de regreso a `/equipo`.

## Aliado

`page.tsx:25` — `key={l.projectNombre}` duplicada con proyectos homónimos. `service.ts:19,30` — `tarifaHora` de `0.00` es falsy → `valorizado` sale `null` en vez de `$0`. Falta el **total agregado**: la pantalla pregunta "cuánto valor regalé" y obliga a sumar a ojo. `Project.presupuestoAliadoHoras` existe (schema:368) y **nadie lo lee** — contrastarlo convierte la bitácora en gobernanza.

## ROI (archivada)

`page.tsx:9` llama `notFound()` antes de `verifySession`: correcto, 404 sin filtrar sesión. Si se revive **no cumple DESIGN.md**: `bg-neutral-50`/`text-neutral-900`/`border-neutral-200` (`:17,20,21,29`) es Tailwind crudo en vez de los tokens, y `:29` lleva `shadow-sm`. Es la pantalla anterior al rediseño de agosto, congelada. `service.ts:14` — `recompras: nombres.length` incluye el proyecto original.

---

## Top 10 priorizado (impacto × esfuerzo)

| # | Qué | Dónde | Esfuerzo |
|---|---|---|---|
| 1 | Validación de email + control de rol en la invitación | `equipo/actions.ts:7` | S |
| 2 | `NaN` en el health score por `cadenciaDias = 0` | `stakeholders/service.ts:187` + `actions.ts:104` | S |
| 3 | Entregable vencido pintado "A tiempo" en verde | `proyectos/[id]/service.ts:20` | S |
| 4 | Inputs a 16px (mata el auto-zoom de iOS en todo el alcance) | `globals.css` / clases `CAMPO` | S |
| 5 | Blancos táctiles a 44px, empezando por el "?" de 18px y ✓/✕ | `ayuda-contextual.tsx:102`, `inline-controls.tsx:140` | M |
| 6 | Borrador de status que se pierde al regenerar | `StatusEquipoSection.tsx:78` | S |
| 7 | `pctReal` histórico presentado como cumplimiento semanal | `asignaciones/service.ts:12` | M |
| 8 | Fechas futuras + asimetría 3:1 rota en el score | `stakeholders/service.ts:181`, `actions.ts:148` | S |
| 9 | Errores en español que no llegan: adoptar `{ok,error}` de `evidencia-actions.ts:27` | `desarrollo/actions.ts`, `literatura-actions.ts` | M |
| 10 | `toISOString()` → `todayStr()` en las 6 reincidencias (empezando por `/caso`) | `caso/service.ts:91` y 5 más | S |

**Fuera del top-10 pero barato y desbloquea mucho:** cablear `borrarInteraccionAction` (ya escrita, `stakeholders/actions.ts:178`) y el link del portal de cliente (`portal-actions.ts`, código completo sin UI).

---

## Revisión QA — cascarón y transversales, WTW App

Contexto leído: `CLAUDE.md`, `PRODUCT.md`, `DESIGN.md`, `capacitor.config.ts`, los dos docs de `docs/plans/2026-09-04-*`. Todo lo de abajo sale de lectura de código; no se editó ni ejecutó nada.

---

## 1. Cascarón y navegación (`AppShell.tsx`, `(app)/layout.tsx`, `layout.tsx`, `nav-inferior.tsx`, `nav-iconos.tsx`)

**Qué hace bien.** La nav por momentos cumple el principio "instrumento, no dashboard": rail/expandido con preferencia persistida vía `useSyncExternalStore` (regla 1 respetada, sin flash), tooltips `fixed` en portal que escapan del `overflow` del sidebar, iconos SVG propios (el engrane vs. sol ya corregido), y `(app)/layout.tsx:13-17` pasa objeto plano de proyectos (regla 2). El fade con `ResizeObserver` en la fila de tabs es el arreglo correcto.

**Bugs / riesgos.**

- **`src/app/layout.tsx:27-29` — `viewport` sin `viewportFit: 'cover'`. Severidad ALTA.** No existe `viewportFit` en todo `src/` (grep: 0 resultados). Sin `viewport-fit=cover`, WKWebView y Safari resuelven `env(safe-area-inset-bottom)` a **0**, así que el padding de `nav-inferior.tsx:137` y de `AppShell.tsx:524` es letra muerta: en iPhone el home indicator queda encima de los tabs — exactamente el bug que el comentario dice estar evitando. Reproducir: iPhone en PWA/standalone o cascarón, mirar la barra inferior.
- **`AppShell.tsx:226-228, 239, 271-273` — blancos táctiles bajo 44 px en iPad. Severidad MEDIA.** El sidebar `md:` arranca en 768 px, y el iPad (834 px vertical) cae ahí: `py-2` + icono 20 px ≈ 36 px de alto; el chevron de sub-items es `h-7 w-7` (28 px); los sub-links de proyecto `px-2 py-1 text-xs` ≈ 24 px. El dispositivo principal navega con el dedo sobre blancos de 24-36 px.
- **`AppShell.tsx:369` — el atajo `[` probablemente nunca dispara en el teclado de Mau. Severidad BAJA.** El handler descarta el evento si `e.altKey`; en layout español (ISO/es-latinoamericano de Apple) `[` se teclea con Option/Alt. Reproducir: teclado español, pulsar `[` fuera de un input — no pasa nada.
- **`nav-inferior.tsx:65-80` — panel "Más" sin trampa de foco ni scroll lock. Severidad BAJA.** Se declara `aria-modal="true"` pero el foco no entra al panel al abrir, y la barra inferior (`z-40`) sigue tocable bajo el backdrop (`z-30`).
- **`nav-inferior.tsx:41` — `abiertoEn === pathname`: si desde "Más" se toca un destino que ya es la ruta actual, el panel no se cierra. Severidad BAJA.**

**Quick fixes.**
1. `layout.tsx:27` → `export const viewport: Viewport = { themeColor: '#0A7C82', viewportFit: 'cover' }`.
2. `AppShell.tsx:227` → rail `py-3` y expandido `py-2.5`; chevron `h-9 w-9`; sub-links `py-2`. Sube ~8 px por fila, cabe en 224 px.
3. `nav-inferior.tsx:44` → `setAbiertoEn(null)` también en el `onClick` de cada `<Link>` del panel.

**Mejoras de UX (medio plazo).**
- **Entrada táctil a ⌘K (S).** En iPad sin teclado no hay buscador: con 12+ destinos, el sidebar es la lista que el propio comentario de `command-palette.tsx:7-10` dice querer evitar. Un botón lupa en el rail resuelve.
- **Foco visible consistente (M).** Un solo `focus-visible` en todo `src/` (`SemanaBoard.tsx:785`) y seis `focus:outline-none`. Definir un anillo global en `globals.css` (`:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px }`).
- **`aria-describedby` del tooltip (S):** `AppShell.tsx:248` pinta `role="tooltip"` que ningún lector anuncia.

---

## 2. Ayuda, tour, menú flotante, ⌘K (`src/components/`)

**Qué hace bien.** `menu-flotante.tsx` y `ayuda-contextual.tsx` resuelven de verdad el recorte por `overflow` (portal + `fixed` + recolocación en scroll/resize), y `menu-geometria.ts` mantiene el volteo probable sin navegador. `inline-controls.tsx` sustituye `confirm`/`prompt` por razones correctas y documentadas.

**Bugs / riesgos.**

- **`tour-primera-vez.tsx:39, 41-43` — "Entendido" no cierra la guía reabierta. Severidad MEDIA.** `visto = flag === '1' && !reabierto`; `descartar()` escribe el flag pero nunca hace `setReabierto(false)`, así que tras pulsar el "?" y luego "Entendido" el banner se queda abierto hasta recargar. Reproducir: en `/dia`, descartar → "?" → "Entendido".
- **`inline-controls.tsx:40, 107, 140, 149` — botones sin `type="button"`. Severidad MEDIA.** Dentro de cualquier `<form>` son `submit` por default: el primer clic de `ConfirmarQuitar` (el que solo "arma") envía el formulario, y el ✓ de `CampoEnLinea` también.
- **`command-palette.tsx:108-112` — cerrar con ⌘K no devuelve el foco. Severidad BAJA.** El `setAbierto(v => false)` del atajo no pasa por `cerrar()` (línea 94), que es quien restaura `foco.current`. Cerrar con Esc sí funciona.
- **`command-palette.tsx:224` — `<li>` entre `role="listbox"` y `role="option"`. Severidad BAJA.** Rompe la relación padre/hijo ARIA; falta `role="presentation"` en el `<li>`.
- **`ayuda-contextual.tsx:102` — botón "?" de 18×18 px. Severidad MEDIA en iPad.** Es la afordancia de ayuda principal del dispositivo principal, a menos de la mitad del blanco recomendado. Igual en `tour-primera-vez.tsx:54`.
- **`command-palette.tsx:177` — sin bloqueo de scroll del body: en iPad la página de atrás sigue moviéndose bajo el diálogo. Severidad BAJA.**

**Quick fixes.** (a) `descartar()` → añadir `setReabierto(false)`. (b) `type="button"` en los cuatro botones de `inline-controls.tsx`. (c) el handler de ⌘K llama `cerrar()` cuando ya está abierto. (d) `role="presentation"` en el `<li>`.

**Mejoras de UX.**
- **Área táctil ampliada del "?" sin cambiar su tamaño visual (S):** pseudo-elemento `::after` de 44×44 px con `-inset-3`. Conserva la discreción que DESIGN.md pide y deja de fallarse en el iPad.
- **⌘K con acciones, no solo destinos (M):** "empezar cronómetro", "cerrar el día", "nueva actividad". Hoy es solo navegación; PRODUCT.md dice que el costo administrativo es el enemigo.

---

## 3. Ajustes, recordatorios y capa nativa (`settings/`, `nativo/`, `nativo-bridge.tsx`, `lib/nativo.ts`)

**Qué hace bien.** La honestidad del panel es ejemplar y muy alineada con PRODUCT.md §3 y §4: `Nativo.tsx:67-72` declara el límite conocido (planear desde la Mac deja un aviso de más) en vez de esconderlo, y lista lo que iOS **tiene programado de verdad** en lugar de prometer. El permiso siempre se pide con gesto (`lib/nativo.ts:36, 114`).

**Bugs / riesgos.**

- **`settings/actions.ts:44-50` — `updateSettings` no valida nada salvo `bufferPct`. Severidad MEDIA.** `horarioInicio/Fin`, `comidaInicio/Fin` se guardan como `String(formData.get(...))` crudo (si falta el campo, queda literalmente `"null"`), y `factorManual: Number(raw)` con texto no numérico da `NaN` → error de Prisma Decimal → 500 sin frontera de error. Reproducir: escribir `9am` en Horario inicio, o `abc` en factor manual.
- **`SettingsForm.tsx:30-42` — los cuatro campos de horario son `<input>` de texto plano. Severidad MEDIA (UX iPad).** Sin `type="time"` ni `inputMode`, el iPad abre teclado alfanumérico completo para escribir `09:00`; y sin validación (punto anterior) el dato malo llega a la base y rompe la aritmética de día/semana.
- **`lib/nativo.ts:88` — `ultimaSync = ahora` se estampa **antes** del `fetch`. Severidad BAJA.** Si el endpoint falla (401 por sesión expirada, Neon dormido), la reintentona queda bloqueada 60 s aunque nunca se sincronizó nada.
- **`nativo-bridge.tsx:18` — carrera en arranque en frío. Severidad MEDIA.** `escucharTapDeAviso` registra el listener de forma asíncrona dentro de un `useEffect` que corre después de hidratar; si el tap en el aviso es lo que **lanza** la app, el evento puede haberse emitido antes de que el listener exista → el aviso abre la app pero no navega a `/semana` ni `/cierre`. Es justo el caso de uso del recordatorio.
- **`Nativo.tsx:68` — texto "iPad" cableado para toda plataforma iOS. Severidad BAJA.** En iPhone dice "En este iPad…".
- **`settings/page.tsx:11` — `if (!session) return null`** devuelve una página en blanco en vez de `redirect('/login')`. Severidad BAJA (el layout ya protege, pero deja una ruta con salida distinta).
- **`Recordatorios.tsx:60-69` — `guardar()` es optimista sin rollback ni manejo de error;** `apagarTodos()` (línea 114) no valida `res.ok` ni se deshabilita mientras corre. Severidad BAJA.

**Quick fixes.** (a) `type="time"` en los 4 horarios y `type="number" step="0.05" min="0.5" max="3"` en factor manual. (b) validar en `updateSettings` con un regex `^\d{2}:\d{2}$` y devolver `{ error }` en vez de reventar. (c) mover `ultimaSync = ahora` después de `if (!res.ok) return null`. (d) copy neutro en vez de "iPad" o detectar iPad por `navigator.maxTouchPoints`.

**Mejoras de UX.**
- **Registrar el listener de tap fuera de React (M):** llamarlo en un módulo importado por el layout raíz, o consultar `LocalNotifications.getDeliveredNotifications()` al montar para recuperar el tap perdido.
- **Un solo lugar para "avisos" (S):** hoy hay dos secciones (`Recordatorios` + `App nativa`) que hablan del mismo canal; el panel Nativo solo aporta el botón de prueba.

**Desarrollos nuevos.**
- **APNs / push remoto (L).** Es el pendiente que el propio diseño nombra: cierra el hueco "planeé desde la Mac y el iPad no se abrió". Requiere cuenta de pago; justifica directamente el principio 3 de PRODUCT.md.
- **Widget de iOS (M).** Un widget de pantalla de inicio con "lo siguiente del día" y el cronómetro corriendo ataca la brecha del 360 (visibilidad de tiempo) sin abrir la app: el registro deja de cobrar trabajo administrativo.
- **Atajos / Siri (S-M).** "Oye Siri, empieza el bloque" y "cierra mi día" con `App Intents` a través de un plugin de Capacitor. El cierre debe caber en un minuto (principio 5); la voz lo baja a segundos.

---

## 4. PWA: service worker, manifest, registro (`app/sw.js/route.ts`, `register-sw.tsx`, `manifest.ts`)

**Qué hace bien.** Versionar el nombre de caché por `VERCEL_GIT_COMMIT_SHA` (línea 9) arregla de raíz el bug documentado del cache eterno, y apagar el SW dentro del cascarón (`register-sw.tsx:12`) evita el segundo lugar donde una versión vieja se pega. Nota: `public/sw.js` **ya no existe**; el SW se sirve desde la ruta.

**Bugs / riesgos.**

- **`sw.js/route.ts:11, 14` — el shell precachea `/dia` desde una página sin sesión. Severidad ALTA.** `RegisterSW` vive en el layout **raíz**, así que el SW se registra también en `/login`; el `install` hace `addAll(['/dia'])`, `/dia` responde 307 → `/login`, y bajo la clave `/dia` queda cacheado el HTML de **login**. Ese mismo objeto es el fallback offline de la línea 79. Resultado: sin red, la PWA muestra la pantalla de login aunque haya sesión, hasta el siguiente deploy.
- **`sw.js/route.ts:74-79` — respuestas de navegación redirigidas en caché. Severidad MEDIA.** `res.clone()` se guarda tal cual; servir con `respondWith` una respuesta con `redirected: true` para una petición `navigate` es rechazado por el navegador ("Response served by service worker has redirections") → la navegación offline falla en duro en vez de degradar.
- **`sw.js/route.ts:75-77` — HTML autenticado en caché compartida, nunca borrada en logout. Severidad MEDIA (privacidad).** `logoutAction` (`settings/actions.ts:11`) borra la cookie pero no llama `caches.delete`; en un dispositivo compartido, offline se sigue pintando el `/dia` del usuario anterior. Los `cache.put` además están fuera de `waitUntil` (pueden morir con el evento).
- **`manifest.ts:10` — `background_color: '#ffffff'` contra `paper #eef2f2`. Severidad BAJA.** El splash de la PWA destella blanco; `capacitor.config.ts` ya se corrigió a `#eef2f2` justo por esto. Faltan también `scope`, `id` y `lang`.

**Quick fixes.** (a) `SHELL = ['/manifest.webmanifest']` y quitar `/dia` del precache (o cachearlo solo en el primer `fetch` exitoso). (b) en el handler `fetch`, `if (res.ok && !res.redirected)` antes de `cache.put`. (c) `background_color: '#eef2f2'` + `scope: '/'` + `id: '/dia'`. (d) en `logoutAction`, mandar un `postMessage` al SW o registrar `caches.keys().then(k => k.forEach(caches.delete))` en el cliente tras el logout.

---

## 5. Auth y API (`proxy.ts`, `login/`, `session.ts`, `api-auth.ts`, `api/v1/`, `api/cron/`)

**Qué hace bien.** La separación de dos capas está bien pensada y documentada: el proxy en Edge solo valida firma, la verificación con DB vive en `verifySession` (`auth.ts:16`), y el loop `login↔dia` se evita a propósito. Las 18 rutas de `api/v1` autentican sin excepción (`apiUser` o `verifySession`, verificado por grep), y el `DELETE` de push escopea por `userId` (regla 4). El cron exige `CRON_SECRET` y devuelve 401 si falta (`api/cron/recordatorios/route.ts:27-30`) — no queda abierto por omisión.

**Bugs / riesgos.**

- **No existe ni un `error.tsx`, `loading.tsx`, `not-found.tsx` ni `global-error.tsx` en todo `src/`. Severidad ALTA.** Cualquier 500 (Neon dormido, `findUniqueOrThrow` de `settings/page.tsx:14`, el `NaN` del factor manual) cae en la página de error genérica de Next. Dentro del cascarón WKWebView **no hay barra de direcciones ni botón de recarga**: el usuario queda atrapado y tiene que matar la app. Es el peor caso de todo este informe para el dispositivo principal.
- **`login/actions.ts:16-19` — sin límite de intentos y con enumeración de usuarios por tiempo. Severidad MEDIA.** `bcrypt.compare` solo corre si el correo existe: la respuesta a un correo inexistente vuelve en ~1 ms y a uno real en ~100 ms. Sumado a que no hay throttling, un correo válido es distinguible y luego se puede atacar por fuerza bruta.
- **`api-auth.ts:18` — el PAT no expira, no se puede revocar desde la UI y hay uno solo por usuario. Severidad MEDIA.** Vive en `~/.wtw-token` en claro; sin rotación ni `lastUsedAt`, un token filtrado da acceso indefinido a toda la API.
- **`session.ts:19-29` — `decrypt` hace `payload as {userId, exp}` sin comprobar que `userId` sea string. Severidad BAJA.** No hay `issuer`/`audience` ni verificación de `alg` esperado más allá del default de `jose`.
- **`proxy.ts:32` — el lookahead `api` no está anclado. Severidad BAJA.** Cualquier ruta futura que empiece con "api" (p.ej. `/apiario`) quedaría fuera del guardia. Usar `api/`.
- **`login/LoginForm.tsx:36` — el error no se anuncia (`role="alert"` ausente) ni recibe foco. Severidad BAJA (a11y).**

**Quick fixes.** (a) Añadir `src/app/(app)/error.tsx` y `src/app/global-error.tsx` con copy en la voz de la app y un botón "Reintentar" (`reset()`), más un `loading.tsx` en `(app)` para el cold start de Neon. (b) `role="alert"` en el `<p>` del error de login. (c) `api/` en el matcher. (d) Ejecutar siempre un `bcrypt.compare` contra un hash señuelo cuando el usuario no existe.

**Mejoras de UX.**
- **Estado offline explícito (M).** Con el SW corregido, una barra de estado —no un banner— que diga "sin red, viendo lo último guardado". DESIGN.md pide barra de estado, no banner.
- **Rotación de PAT desde Ajustes (S).**

**Desarrollos nuevos.**
- **Suscripción de calendario (ICS) de doble vía (M).** Ya existe `api/v1/calendar/export`; publicarla como URL suscribible por token haría que el lienzo de la semana aparezca en el calendario del cliente sin exportar a mano.
- **Live Activity / Dynamic Island para el cronómetro (L).** El material de la app es el tiempo (DESIGN.md); un cronómetro visible sin abrir la app es la instrumentación que PRODUCT.md pide.

---

## Top 10 priorizado (impacto × esfuerzo)

| # | Qué | Dónde | Esfuerzo |
|---|---|---|---|
| 1 | `viewportFit: 'cover'` — hoy todo el `env(safe-area-inset-*)` de la app vale 0 | `src/app/layout.tsx:27` | 5 min |
| 2 | Añadir `error.tsx` + `global-error.tsx` + `loading.tsx`: sin ellos, un 500 atrapa al usuario dentro del cascarón | `src/app/(app)/`, `src/app/` | 1 h |
| 3 | Sacar `/dia` del precache del SW y no cachear respuestas redirigidas | `src/app/sw.js/route.ts:11, 74-79` | 30 min |
| 4 | Validar horarios y factor manual en `updateSettings` + `type="time"` en el form | `settings/actions.ts:44-50`, `SettingsForm.tsx:30-56` | 1 h |
| 5 | `type="button"` en los 4 botones de `inline-controls` (hoy envían el form) | `inline-controls.tsx:40, 107, 140, 149` | 5 min |
| 6 | Blancos táctiles ≥44 px en el sidebar y en los "?" (iPad es el dispositivo principal) | `AppShell.tsx:226-273`, `ayuda-contextual.tsx:102`, `tour-primera-vez.tsx:54` | 1 h |
| 7 | Borrar cachés del SW en `logoutAction` (HTML autenticado sobrevive al logout) | `settings/actions.ts:11` | 30 min |
| 8 | Arreglar el tap del aviso en arranque en frío (listener asíncrono) | `nativo-bridge.tsx:18` | 1-2 h |
| 9 | `bcrypt.compare` señuelo + throttling de login | `login/actions.ts:16-19` | 1 h |
| 10 | "Entendido" del tour reabierto no cierra; `[` no funciona en teclado español | `tour-primera-vez.tsx:41`, `AppShell.tsx:369` | 20 min |
