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
2. **Engagement (método top-tier)** — workplan hacia atrás desde entregables, hypothesis-driven, gates de calidad, cadencia cliente.
3. **Economía de firma** — utilización, burn vs. presupuesto, % dedicación por proyecto. Sale gratis de los cronómetros (sin timesheet aparte).
4. **Desarrollo profesional** — competencias VP por escalafón, evidencia anclada a trabajo real, caso de promoción.

## §1 — Modelo de datos (PostgreSQL + Prisma)

### Capa personal
- `User` — email, passwordHash, horario laboral, comida, buffer %, URL .ics, nivel actual/objetivo, timezone
- `Week` — userId, semana ISO, rango, factor usado, reflexión, estatus (planning/active/closed)
- `Win` — weekId, posición 1–3, título, DoD, logrado/no
- `Task` — userId, projectId, deliverableId?, winId?, weekId?, título, estimado min, ajustado min, DoD items, deadline, estatus (backlog/planned/in_progress/done/deferred), competencias[]
- `Block` — fecha, inicio, fin, tipo (tarea/junta/hito/break), planMin, taskId?, título
- `TimeEntry` — blockId/taskId, startedAt, stoppedAt, segundos. Un solo timer corriendo por usuario (enforced en servidor)
- `CalendarEvent` — sincronizado del .ics por cron

**Carry desaparece como mecanismo:** una tarea inconclusa sigue `in_progress` y se le crea un bloque en el día nuevo; el tiempo acumulado vive en la tarea. Elimina la clase entera de bugs de copiado entre fechas.

**Factor de realismo automático:** promedio móvil (4 semanas) de real/estimado desde TimeEntries.

### Capa engagement
- `Project` extendido — cliente, color, tipo (facturable/interno/desarrollo), fechas SOW, presupuesto horas, tarifa opcional, estatus
- `Deliverable` — projectId, número SOW, nombre, hipótesis/respuesta esperada, fecha comprometida, presupuesto horas, estatus con gates (borrador → rev_interna → rev_cliente → aceptado), liga a carta de aceptación
- `Issue` (RAID light) — projectId, descripción, responsable, fecha, estatus (formaliza pendientes PMO)

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
3. **Utilización personal semanal:** % facturable automático vs. meta 70–80%
4. **Status semanal generado:** avances por entregable + semáforos + horas desde la DB (reemplaza armado manual de slides)
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
| 5 — Cliente + economía | Status semanal generado, semáforos SOW (absorbe avances-cliente), burn completo | cadencia cliente automatizada |
| 6 — Equipo | Invitaciones, carga del equipo, ritual guiado en UI, módulo 360, staffing por desarrollo | compañeros VP entran |

El tablero actual sigue corriendo hasta el switchover de Fase 2. Gestión del proyecto con GSD (como RestaurantOS).

## Riesgos y mitigaciones

- **Timers offline / multi-dispositivo:** buffer localStorage + reconciliación; un timer por usuario en servidor
- **.ics de Outlook:** ya funciona hoy con liga publicada; cron server-side lo hace más confiable que el script local
- **Migración de hábito:** paridad de Mi Día antes del switchover; tablero viejo queda congelado como fallback
- **Scope creep:** las fases 5–6 no arrancan hasta validar 4 semanas de uso real de fases 1–4

## Out of scope (v1)

Ritual guiado en UI (fase 6), realtime websockets, app nativa, integraciones con PSA externos, facturación/invoicing, multi-tenancy comercial (el schema no lo impide, pero no se diseña para ello todavía).
