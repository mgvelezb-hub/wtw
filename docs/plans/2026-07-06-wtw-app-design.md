# WTW App v2 — Diseño aprobado

**Fecha:** 2026-07-06 · **Estado:** Aprobado por Mau · **Nombre de trabajo:** wtw-app

## Contexto y motivación

El tablero WTW actual (`~/projects/wtw-tablero`: `tablero.html` 868 líneas + `week-data.js` + `pendientes-data.js` + `avances-data.js`, deploy en wtw-tablero.vercel.app) implementa la metodología *Winning the Week* para la ejecución personal de Mau, con 5 skills de Claude como motor conversacional (`/wtw-semana`, `/wtw-dia`, `/wtw-comprometer`, `/wtw-portal`, `/wtw-context`).

Limitaciones estructurales que motivan la v2:
- Single-user, single-week: `WEEK` se regenera semanalmente; sin histórico queryable
- Proyectos son etiquetas, no entidades: sin carga por proyecto, sin facturable, sin burn
- Pipeline frágil: Obsidian → skill → `week-data.js` → deploy manual (4 pasos que se rompen si uno se salta)
- Estado atado a `id`s en localStorage; carry/rollover como mecanismo copiado entre fechas (fuente de bugs recurrente)
- Sin auth, sin usuarios, HTML monolítico

## Investigación (2026-07-06)

**Metodología WTW oficial:** no existe app — los autores (Lifehack Method) venden libro + worksheets + coaching. El tablero de Mau ya es más producto que la oferta oficial.

**Planners personales:** Sunsama ($20/mes) es lo más cercano filosóficamente (ritual guiado, time tracking, estimado vs. real) pero single-player. Motion = auto-scheduling AI. Akiflow ($34/mes) = inbox + slots. Ninguno tiene triage de capacidad forzado ni factor de realismo ni visión multi-proyecto de consultoría.

**Capacity planning para equipos:** Float (~$7/persona/mes), Runn (forecasting + finanzas), Productive (all-in-one agencias). Carga de equipo y utilización, pero cero ritual personal ni time-blocking propio.

**Benchmarks boutique 2026:** utilización sana 70–80% facturable (promedio global ~68%, top ~80%). Firmas con tracking activo de utilización: +15–25% rentabilidad por proyecto. Tracking en tiempo real vs. exports manuales: +4–8 pp de utilización.

**El hueco:** nadie combina ritual semanal con triage + ejecución cronometrada + carga multi-proyecto para equipo chico de consultores. Hoy se resuelve con Sunsama + Float (~$30/persona/mes) sin integración y sin motor AI conversacional.

## Decisiones tomadas

| Decisión | Elección |
|----------|----------|
| Audiencia 6 meses | **Personal primero, equipo-ready** — schema multi-usuario desde día 1, compañeros entran cuando esté probada |
| Dónde vive el ritual | **Skills + API primero** — los skills de Claude siguen siendo el motor, escriben a la API; ritual guiado en UI (estilo Sunsama) en fase de equipo |
| Alcance v1 | **Core + multi-proyecto** — Mi Día, Plan Semanal, Proyectos/Entregables, Histórico. Pendientes PMO y Avances cliente migran después |
| Base técnica | **Rebuild Next.js + PostgreSQL, PWA** (enfoque A) — stack de RestaurantOS |

## Las 4 capas del producto

1. **Ejecución personal (WTW)** — ritual semanal, triage de capacidad, factor de realismo, DoD, cronómetros. Se conserva íntegra: es la ventaja competitiva.
2. **Engagement (método top-tier)** — workplan hacia atrás desde entregables, hypothesis-driven, gates de calidad, cadencia cliente. **Alcance dual:** todo trabajo se clasifica `sow` (comprometido en el plan) o `aliado` (valor adicional intencional fuera del plan).
3. **Economía de firma** — utilización, burn vs. presupuesto, % dedicación por proyecto. Sale gratis de los cronómetros (sin timesheet aparte).
4. **Desarrollo profesional** — competencias VP por escalafón, evidencia anclada a trabajo real, caso de promoción.

### El modelo Aliado Estratégico (diferencial VP)

El fuerte de VP no es solo entregar lo prometido: es **generar confianza ejecutando actividades fuera del plan de trabajo** — meterse a las entrañas del cliente, ver los dolores y ayudar. Eso posiciona a VP como aliado estratégico y genera recompras orgánicas en otros proyectos/soluciones. Las extensiones de timeline que esto provoca son gestionables *precisamente porque son intencionales*.

Implicación de producto — **el trabajo fuera del plan NO es negativo**, es una categoría propia que se registra, se valoriza y se cosecha:

- Al capturar trabajo nuevo fuera del SOW, se marca `alcance: aliado` + **qué dolor del cliente atiende** (sin fricción, un campo)
- **Ledger de valor adicional** por cliente/proyecto: actividades, horas reales (de los cronómetros), dolores atendidos, valorizado a tarifa ("MX$ X de valor entregado no cobrado")
- **Semáforos que no castigan**: el burn separa horas SOW vs. horas aliado; una extensión de timeline se atribuye — "el proyecto se extendió 3 semanas: 2 por inversión aliado (elegida), 1 por desviación real" — conversaciones distintas
- **Momentos de cosecha**: reporte exportable de valor adicional en puntos clave (cierre de fase, QBR, negociación) → decide VP si se cobra como alcance adicional o se posiciona como cortesía estratégica con monto visible
- **ROI de relación** (fase equipo): recompras y proyectos nuevos ligados al cliente donde se invirtió — medir que la alianza funciona
- Utilización en 3 cubetas: **facturable / inversión aliado / interno** — la inversión aliado deja de contaminar la métrica de fuga
- **Gobernanza de la inversión:** `Project.presupuestoAliadoHoras` — la generosidad funciona porque es intencional, y la intención necesita presupuesto. `/wtw-comprometer` lo respeta: "buen trabajo aliado, pero ya invertiste 18 de 20h en Liverpool este trimestre — ¿consciente?". Sin límite, el modelo aliado se convierte en la excusa que se come la semana.

Ninguna herramienta PSA hace esto: todas tratan el fuera-de-alcance como leakage a eliminar. Aquí es el motor de crecimiento comercial, medido y gobernado.

## §1 — Modelo de datos (PostgreSQL + Prisma)

### Capa personal
- `User` — email, passwordHash, horario laboral, comida, buffer %, URL .ics, nivel actual/objetivo, timezone
- `Week` — userId, semana ISO, rango, factor usado, reflexión, estatus (planning/active/closed)
- `Win` — weekId, posición 1–3, título, DoD, logrado/no
- `Task` — userId, projectId, deliverableId?, winId?, weekId?, título, estimado min, ajustado min, DoD items, deadline, estatus (backlog/planned/in_progress/done/deferred), competencias[], **alcance (sow/aliado)**, **dolorCliente?** (qué dolor atiende si es aliado)
- `Block` — fecha, inicio, fin, tipo (tarea/junta/hito/break), planMin, taskId?, título
- `TimeEntry` — blockId/taskId, startedAt, stoppedAt, segundos, `manual` (correcciones a mano marcadas — honestidad de datos). Un solo timer corriendo por usuario (enforced en servidor)
- `CalendarEvent` — sincronizado del .ics por cron
- `DayOverride` — capacidad por día (viajes, festivos, vacaciones, jornadas atípicas): fecha, horario, nota — W26 probó que el override semanal no basta
- `Allocation` — % de asignación objetivo por proyecto con vigencia (`pct`, `vigenteDesde/Hasta`): los jefes cambian asignaciones en cualquier momento; el real (TimeEntries) se compara contra el objetivo vigente

**Carry desaparece como mecanismo:** una tarea inconclusa sigue `in_progress` y se le crea un bloque en el día nuevo; el tiempo acumulado vive en la tarea. Elimina la clase entera de bugs de copiado entre fechas.

**Factor de realismo automático:** promedio móvil (4 semanas) de real/estimado desde TimeEntries.

### Capa engagement
- `Project` extendido — cliente, color, tipo (facturable/interno/desarrollo), fechas SOW, presupuesto horas, tarifa opcional, estatus, **origen?** (recompra derivada de qué relación/proyecto — para ROI de alianza)
- `Deliverable` — projectId, número SOW, nombre, hipótesis/respuesta esperada, **fechaInicio + fechaComprometida (baseline inmutable) + fechaProyectada (forecast vivo)**, presupuesto horas, **avancePct declarado** (proyectado vs. real, como el scorecard Nadro), estatus con gates (borrador → rev_interna → rev_cliente → aceptado), liga a carta de aceptación, **alcance (sow/aliado)**. Modela entregables O frentes de trabajo (workstreams tipo "Homologación de información")
- `Issue` (RAID completo, una tabla) — projectId, **tipo (riesgo/pendiente/acuerdo/decisión/cambio)**, descripción, responsable (interno O del cliente), fecha, estatus. El tipo `cambio` registra modificaciones al plan de trabajo (change control light)

### Capa desarrollo profesional
- `Level` — escalafón VP (Analista → Consultor/Analista Sr → Gerente → Gerente Sr) con expectativas del PDF por nivel
- `Competency` — dos tipos: 20 conductas individuales + 10 roles VP ("Quien presenta", "Quien tiene expertise técnico", "La perfección en cada detalle", "La mano del Rey", "El cerebro que crea", "Los datos duros", "Quien cuida al equipo", "La conexión a la Matrix", "Todo en orden por el bien de la casa", "La estrategia que renovará al Estado") con sus reactivos
- `Evidence` — userId, competencyId, taskId/deliverableId (trabajo completado con DoD), nota, fecha

Fuentes del catálogo: `OneDrive-VPConsulting/VP/Consolidado Anual de Evaluación de Desempeño - Mau.xlsx` (estructura 360 completa) + PDF de expectativas por nivel (citado en config WTW).

## §2 — Arquitectura

- **Next.js 15 (App Router) + TypeScript + Tailwind v4 + shadcn/ui + Recharts** — stack de RestaurantOS, mismos patrones
- **Auth:** Jose + bcryptjs + cookie HttpOnly
- **API `/api/v1/*`** con token personal (PAT) para skills de Claude
- **Cronómetros:** tick en cliente; eventos start/stop al servidor; buffer localStorage offline con reconciliación (patrón draft-autosave RestaurantOS); servidor garantiza un timer por usuario
- **Sync multi-dispositivo:** SWR polling + UI optimista en v1; realtime después si hace falta
- **Calendario:** Vercel cron lee .ics de Outlook cada hora → upsert `CalendarEvent`; lógica de `wtw_calendar.py` portada a TypeScript
- **PWA:** manifest + service worker, instalable en iPhone/iPad, offline para el día actual
- **Deploy:** Vercel + Neon

## §3 — Migración de skills

| Skill | Después |
|-------|---------|
| `/wtw-semana` | mismo ritual conversacional; escribe a la API; nota Obsidian se conserva como bitácora histórica |
| `/wtw-dia` | lee capacidad y bloques de la API |
| `/wtw-comprometer` | consulta capacidad restante exacta de la DB |
| `/wtw-portal` | **muere** — la app lee la DB directo |
| `/wtw-context` | se simplifica o muere |

DB = fuente de verdad; Obsidian = bitácora humana opcional.

## §4 — Vistas v1

1. **Mi Día** — paridad con tablero actual: bloques, cronómetros, DoD, sección done. Mobile-first
2. **Mi Semana** — wins, capacidad vs. carga, bloques por día
3. **Proyectos** — carga semanal por proyecto (plan vs. real), % dedicación, facturable, tendencia; entregables con semáforos y burn
4. **Histórico** — factor de realismo auto, estimado vs. real por semana, tasa de wins, utilización personal
5. **Desarrollo** — mapa de cobertura de competencias (radar), bitácora de evidencia
6. **Settings** — horario, buffer, .ics, proyectos, niveles/competencias

## §5 — Prácticas top-tier convertidas en features

1. **Vaciado informado por entregables:** al planear la semana, la app/skill muestra entregables que vencen o están en riesgo → Wins se proponen desde el workplan
2. **Burn vs. presupuesto por entregable:** horas reales vs. presupuestadas, semáforo económico
3. **Utilización personal semanal:** 3 cubetas automáticas — facturable / inversión aliado / interno — vs. meta 70–80%
4. **Status semanal generado:** avances por entregable + semáforos + horas desde la DB (reemplaza armado manual de slides)
4b. **Ledger Aliado + reporte de cosecha:** valor adicional acumulado por cliente (actividades, horas, dolores atendidos, valorizado a tarifa) exportable en momentos de negociación; `/wtw-comprometer` al recibir trabajo nuevo pregunta si es inversión aliado y lo registra con su dolor
5. **Gate de aceptación:** entregable aceptado → dispara carta-entregable
6. **Evidencia de competencias sin fricción:** etiquetado al planear + captura en cierre semanal, anclada a trabajo fechado con DoD verificado
7. **Caso de promoción exportable:** bitácora de evidencia por competencia
8. **(Fase equipo) 360 en la app:** % tiempo por proyecto auto-calculado desde TimeEntries (hoy se llena a mano en el consolidado anual)

## §6 — Fases de construcción

| Fase | Entrega | Hito |
|------|---------|------|
| 1 — Fundación | Schema completo (4 capas) + auth + API core + seed (catálogo VP, proyectos actuales, semana en curso) | DB viva |
| 2 — Mi Día | Vista diaria con timers + PWA | 🎯 switchover: se abandona tablero.html |
| 3 — Semana + skills | Vista semanal + skills apuntando a la API + captura de evidencia en ritual | ritual completo en la app |
| 4 — Proyectos + desarrollo | Vistas Proyectos/Entregables + Histórico + mapa de competencias + utilización | valor multi-proyecto y carrera |
| 5 — Cliente + economía | Status semanal generado, semáforos SOW (absorbe avances-cliente), burn completo, **Ledger Aliado + reporte de cosecha valorizado** | cadencia cliente automatizada |
| 6 — Equipo | Invitaciones, carga del equipo, ritual guiado en UI, módulo 360, staffing por desarrollo, **ROI de relación (recompras ligadas a inversión aliado)** | compañeros VP entran |

El tablero actual sigue corriendo hasta el switchover de Fase 2. Gestión del proyecto con GSD (como RestaurantOS).

## §7 — Revisión 360 (2026-07-06, integrada)

Hallazgos de dos pasadas de revisión: ceguera de taller + 5 lentes (PMO, usuario multi-proyecto, cliente, socios, usuario final). Referencia de formato cliente: scorecard Nadro "Costo de Servir" reporte #10.

### Lente PMO
- **Baseline vs. forecast vs. real**: `fechaComprometida` inmutable + `fechaProyectada` viva + `avancePct` declarado por entregable. El scorecard Nadro reporta "Proyectado 96% vs. Real 71%" — eso requiere curva de plan (fechaInicio/fin por entregable) contra avance declarado. El avance es **declarado, no derivado** de tareas (las tareas no son exhaustivas; PMO best practice)
- **RAID completo en una tabla**: Issue.tipo = riesgo/pendiente/acuerdo/decisión/cambio. `cambio` = change control light (las "modificaciones al plan de trabajo" que hoy viven en Excel)
- **Descartado por YAGNI**: grafo formal de dependencias entre tareas, EVM completo (CPI/SPI), gestión de recursos con skills matrix

### Lente usuario multi-proyecto (asignaciones cambiantes)
- **`Allocation`**: % objetivo por proyecto con vigencia temporal. El jefe dice "ahora 50% Liverpool" un miércoles → nueva fila con vigenteDesde; el histórico se preserva
- **Cumplimiento de asignación**: vista Proyectos muestra objetivo vs. real ("te pidieron 50% Liverpool, llevas 68%") — señal para renegociar o reequilibrar la semana
- `/wtw-semana` propone la mezcla de bloques respetando las asignaciones vigentes; `/wtw-comprometer` alerta cuando un compromiso nuevo rompe la mezcla

### Lente cliente (formato Nadro como spec)
La vista/status cliente replica el scorecard que ya funciona:
- **Sucedió / Sucediendo / Por Suceder** — generado de: tareas done de la semana (por proyecto), bloques+tareas en curso con avancePct, próximos bloques/entregables
- **Semáforos Tiempo / Costo / Riesgos** + avance proyectado vs. real + fechas inicio/término
- **Apoyo Requerido**: Issues con responsable = cliente — accountability visible ("Entrega de información faltante, máx 4 semanas")
- **Cadencia**: próximas reuniones desde CalendarEvents del proyecto
- **Portal cliente con magic-link** (sin login): vista read-only por proyecto. **Frontera de visibilidad dura**: el cliente NUNCA ve horas internas, ledger aliado crudo, economía ni asignaciones — solo avance, entregables, semáforos, acuerdos y sus pendientes
- El PPTX de status se genera desde estos mismos datos (python-pptx server-side o export) — se acaba el armado manual de cada martes

### Lente socios VP
- **Cockpit de firma** (Fase 6): un renglón por proyecto — semáforo, avance proy vs. real, burn, próximo hito, inversión aliado acumulada, último status. Legible en 2 minutos
- **"Ahora mismo"**: timers corriendo del equipo + bloques del día = el minuto a minuto sin preguntar
- **Feed de actividad por proyecto**: log append-only de eventos (tarea done, gate de entregable, issue abierto/cerrado, status emitido) — el socio abre un proyecto y lee la historia reciente
- **Digest semanal automático**: resumen cross-proyecto generado (correo/WhatsApp), para leer en el café del lunes

### Lente usuario final (fricción)
Contratos de UX medibles (estilo "cierre de caja <90 seg" de RestaurantOS):
- Arrancar/parar timer: **1 tap** desde abrir la app
- Captura al inbox: **≤10 seg** (texto y listo; triage después)
- Cierre del día: **≤3 min** guiado (qué terminé, estimado vs. real, qué se mueve)
- Plan de la mañana: **≤2 min** si `/wtw-semana` ya corrió
- La app abre SIEMPRE en "qué sigo haciendo ahora" (bloque actual + timer)
- **Higiene de timers**: notificación de timer huérfano ("llevas 2h10 en un bloque de 30 min — ¿sigue siendo real?"), edición de TimeEntries marcada `manual`

### Otros hallazgos integrados
- **Inbox/captura**: `POST /api/v1/tasks` (estatus backlog, sin semana) desde Fase 1; vista inbox + triage en ritual desde Fase 3; atajo iOS/Siri después
- **Mapa de dolores por cliente** (Fase 5): groupBy de `dolorCliente` — "7 dolores detectados en Liverpool" = borrador de la siguiente propuesta comercial
- **Arranque caliente del factor** (Fase 3): script de importación de notas Obsidian W25–W27 + localStorage del tablero viejo
- **Privacidad de evidencia** (regla desde ya, diseño en Fase 6): la evidencia de competencias es dato de carrera — visible solo para el dueño y su gerente, nunca pares
- **Notificaciones PWA** (Fase 4): inicio de bloque, junta próxima, timer huérfano

### Mapa a fases
| Adición | Schema | UI/Feature |
|---------|--------|-----------|
| presupuestoAliadoHoras, DayOverride, TimeEntry.manual, Allocation, fechas+avancePct Deliverable, Issue.tipo, inbox endpoint | **Fase 1** | — |
| Import histórico, comprometer con allocations/presupuesto aliado, vista inbox | — | Fase 3 |
| Notificaciones PWA, cumplimiento asignación, edición TimeEntries | — | Fase 4 |
| Status cliente formato Nadro + PPTX generado, portal magic-link, mapa dolores, RAID al cliente | portalToken | Fase 5 |
| Cockpit socios, feed actividad, digest, 360, privacidad evidencia | Event log | Fase 6 |

## Riesgos y mitigaciones

- **Timers offline / multi-dispositivo:** buffer localStorage + reconciliación; un timer por usuario en servidor
- **.ics de Outlook:** ya funciona hoy con liga publicada; cron server-side lo hace más confiable que el script local
- **Migración de hábito:** paridad de Mi Día antes del switchover; tablero viejo queda congelado como fallback
- **Scope creep:** las fases 5–6 no arrancan hasta validar 4 semanas de uso real de fases 1–4

## Out of scope (v1)

Ritual guiado en UI (fase 6), realtime websockets, app nativa, integraciones con PSA externos, facturación/invoicing, multi-tenancy comercial (el schema no lo impide, pero no se diseña para ello todavía).
