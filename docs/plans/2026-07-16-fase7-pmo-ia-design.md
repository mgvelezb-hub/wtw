# Fase 7 — PMO con IA: Minutas, Status en tu voz y Memoria que aprende

> Diseño aprobado 2026-07-16 (sesión Fable). Origen: requerimiento de Mau a partir de su
> status manual de Liverpool ET del 15-jul — "quiero picarle en alguna parte y que me dé
> este resumen" + minuta por junta + IA que aprenda de cada usuario.
>
> **Cómo ejecutar este documento:** la Fase A (§6) está a nivel implementable — una sesión
> con Sonnet puede ejecutarla tarea por tarea sin decisiones arquitectónicas pendientes.
> Las Fases B–D (§8) son visión con fundaciones ya sembradas en el schema de la Fase A.
> Leer antes `docs/plans/2026-07-06-wtw-app-design.md` (arquitectura general) y `CLAUDE.md`
> (reglas aprendidas — especialmente auth de dos capas y `db push` en vez de `migrate dev`).

## §0 — El dolor y el insight central

El status semanal de Mau a su equipo (ver Apéndice A, ejemplo real) toma 45–60 min de
redacción manual y depende 100% de su memoria. Analizado con frialdad: **~60% del contenido
no es sobre lo que él hizo, sino sobre lo que otros deben, decidieron o prometieron** —
acuerdos de juntas, esperas de terceros ("sigue sin respuesta de Mario"), hitos de
facturación. Nada de eso se captura estructuradamente hoy: los pendientes accionables sí
(tasks), pero las decisiones y compromisos de terceros mueren en Slack.

**Principio rector de toda la fase:** el 90% de la calidad del status automático viene de la
captura estructurada, no del LLM. La app no "aprende" con magia — aprende porque cada
interacción deja un residuo estructurado que se destila en perfiles:

```
Datos estructurados → Perfil del usuario → Borrador IA → Usuario EDITA →
el diff (borrador vs. final) se guarda → destilación actualiza el perfil
```

El par (borrador, final) es el activo de aprendizaje. Por eso `Artifact` guarda ambos desde
el día 1, aunque la destilación llegue en Fase C: el flywheel necesita datos acumulados.

## §1 — Decisiones tomadas

| Decisión | Elección | Por qué |
|---|---|---|
| ¿Dónde vive la minuta? | Contenedor `Minuta` por junta (block o calendar event) + `MinutaItem` tipados | Los asistentes y el contexto son de la junta; los items individuales se promueven a Task/Issue |
| ¿Reinventar RAID? | **No** — `Issue` ya es RAID (riesgo/pendiente/acuerdo/decisión/cambio). Se extiende con seguimiento de chases y owner interno | El schema ya lo resolvió en Fase 1; MinutaItem se promueve a Issue |
| ¿Status equipo = status cliente? | **No.** El status Nadro/portal (Fase 5) es scorecard estructurado para cliente. Este es texto libre en la voz de Mau para Slack interno | Audiencias y artefactos distintos; comparten insumos |
| ¿Fine-tuning por usuario? | **No.** Ingeniería de contexto: perfil de voz destilado + few-shot con textos reales del usuario | Calidad equivalente, costo marginal, corregible por el usuario |
| ¿La IA escribe datos por sí sola? | **Nunca.** Siempre borrador → confirmación humana. Copiar/enviar es acción del usuario | Confianza; la app jamás publica ni persiste hechos no confirmados |
| ¿Invención de hechos? | **Prohibida por contrato de prompt + eval determinista.** Todo hecho del borrador debe rastrear a los insumos; nombres propios ⊆ whitelist de insumos | Un status con un hecho inventado destruye la confianza en todo el sistema |
| Ruteo de modelos | Generación de borradores: `claude-sonnet-5`. Clasificación/extracción (V2): `claude-haiku-4-5-20251001`. Nada de Opus/Fable en runtime | El trabajo duro es estructural (insumos); el modelo económico basta |
| ¿Multiplayer ahora? | UI single-player, **modelo de datos multiplayer desde ya** (`ownerId` en Issue, `responsableUserId` en MinutaItem) | "@Miguel, hay que meterlo a nuestros pendientes" debe tener destino sin migración futura |
| Dos lentes, un modelo | "Mi semana" (OS personal) intocable y rápida; "Proyecto" (OS de PMO) como superficie separada | Proteger el alma Winning the Week: el PMO no puede volver lenta la operación diaria |
| Regla de admisión de features PMO | Toda feature debe ahorrar más tiempo del que cuesta operarla en la misma semana | Anti-ERP; si capturar cuesta más que lo que devuelve, muere la adopción |

## §2 — Modelo de datos (Fase A completa + fundaciones B–D)

Agregar a `prisma/schema.prisma`. Convenciones del repo: español en nombres de campo,
cuid, enums en minúsculas.

```prisma
// ── Enums nuevos ──────────────────────────────────────

enum MinutaItemTipo {
  acuerdo
  decision
  pendiente_nuestro   // accionable interno → promovible a Task
  pendiente_cliente   // espera de tercero → promovible a Issue
  solicitud_data      // caso especial de espera; ciclo de vida completo en Fase C
  actividad_nueva     // trabajo no previsto → promovible a Task (evaluar alcance sow/aliado)
  riesgo              // → promovible a Issue tipo riesgo
  nota
}

enum MinutaItemEstado {
  abierto
  cerrado
  convertido // ya vive como Task o Issue; la minuta conserva el registro histórico
}

enum ArtifactTipo {
  status_equipo // Fase A
  brief_junta   // Fase C
  status_cliente_texto // Fase C — narrativa para el portal, complementa el scorecard
}

enum ArtifactEstado {
  borrador   // generado, sin tocar
  editado    // el usuario guardó una versión final
  enviado    // el usuario lo copió/mandó (señal de aceptación)
  descartado
}

// ── Captura: minutas por junta ────────────────────────

model Minuta {
  id              String       @id @default(cuid())
  userId          String       // quien captura
  user            User         @relation(fields: [userId], references: [id])
  projectId       String
  project         Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  blockId         String?      // junta del tablero (Block tipo junta)
  block           Block?       @relation(fields: [blockId], references: [id])
  calendarEventId String?      // o junta del calendario Outlook sincronizado
  calendarEvent   CalendarEvent? @relation(fields: [calendarEventId], references: [id])
  fecha           DateTime     @db.Date
  titulo          String       // denormalizado de la junta; editable
  asistentes      String[]     // nombres libres — insumo del mapa de stakeholders (Fase C)
  notas           String?      // texto libre pre-clasificación (dictado/pegado, V2)
  items           MinutaItem[]
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  @@index([projectId, fecha])
}

model MinutaItem {
  id                String           @id @default(cuid())
  minutaId          String
  minuta            Minuta           @relation(fields: [minutaId], references: [id], onDelete: Cascade)
  tipo              MinutaItemTipo
  texto             String
  responsable       String?          // nombre libre (tercero del cliente o interno)
  responsableUserId String?          // si el responsable es usuario de la app (multiplayer-ready)
  fechaCompromiso   DateTime?        @db.Date
  estado            MinutaItemEstado @default(abierto)
  orden             Int              @default(0)
  taskId            String?          // destino si se promovió a Task
  task              Task?            @relation(fields: [taskId], references: [id])
  issueId           String?          // destino si se promovió a Issue
  issue             Issue?           @relation(fields: [issueId], references: [id])
  createdAt         DateTime         @default(now())
}

// ── Artefactos generados: el flywheel de aprendizaje ──

model Artifact {
  id            String         @id @default(cuid())
  userId        String
  user          User           @relation(fields: [userId], references: [id])
  projectId     String?
  project       Project?       @relation(fields: [projectId], references: [id])
  tipo          ArtifactTipo
  audiencia     String?        // "equipo" | "cliente" | nombre de junta (brief)
  rangoDesde    DateTime?      // ventana de insumos cubierta
  rangoHasta    DateTime?
  insumos       Json           // snapshot de IDs y hechos usados — trazabilidad y evals
  borrador      String         // salida cruda del modelo — NUNCA se sobrescribe
  final         String?        // texto tras edición humana — el otro lado del diff
  estado        ArtifactEstado @default(borrador)
  modelo        String         // id exacto del modelo usado
  promptVersion String         // versión de la plantilla — para atribuir regresiones
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  @@index([userId, projectId, tipo, createdAt])
}

// ── Perfiles IA (fundación; destilación automática en Fase C) ──

model AiProfile {
  id        String   @id @default(cuid())
  userId    String?  // perfiles de usuario (voz, rutina)
  projectId String?  // perfiles de proyecto (project brief)
  tipo      String   // "voice_status_equipo" | "routine" | "project_brief" | ...
  contenido Json     // el perfil es VISIBLE Y EDITABLE por el usuario — nunca caja negra
  version   Int      @default(1)
  updatedAt DateTime @updatedAt

  @@unique([userId, projectId, tipo])
}

// ── Observabilidad de costos IA ───────────────────────

model AiCall {
  id           String   @id @default(cuid())
  userId       String
  feature      String   // "status_equipo" | "clasificar_minuta" | ...
  modelo       String
  inputTokens  Int
  outputTokens Int
  ms           Int
  createdAt    DateTime @default(now())

  @@index([userId, createdAt])
}
```

**Extensiones a modelos existentes:**

```prisma
model Issue {
  // ... campos actuales sin cambio ...
  ownerId          String?   // usuario interno que persigue el issue (multiplayer-ready)
  ultimoSeguimiento DateTime? // último chase — habilita "van 3 semanas sin respuesta"
  numSeguimientos  Int       @default(0)
  minutaItems      MinutaItem[]
}

model Task {
  // ... agregar relación inversa:
  minutaItems MinutaItem[]
}

// User, Project, Block, CalendarEvent: agregar relaciones inversas
// (minutas, artifacts, aiProfiles según corresponda).
```

Aplicar con `npx prisma db push --accept-data-loss` + `npx prisma generate` (regla del repo:
`migrate dev` no funciona sin TTY).

## §3 — Capa IA (`src/lib/ai/`)

Estructura nueva:

```
src/lib/ai/
  client.ts            # wrapper del SDK Anthropic: 1 función callModel() que registra AiCall
  models.ts            # constantes de ruteo: GENERATE = "claude-sonnet-5", CLASSIFY = "claude-haiku-4-5-20251001"
  prompts/
    status-equipo.ts   # plantilla versionada (PROMPT_VERSION exportada) — ver §5
  generate-status.ts   # servicio: ensambla contexto → llama modelo → crea Artifact
  status-context.ts    # ensamblador determinista de insumos (SQL puro, sin LLM) — ver §4
```

Reglas:
- Dependencia nueva: `@anthropic-ai/sdk`. Env: `ANTHROPIC_API_KEY` (agregar a `.env` local y
  Vercel; nunca al repo).
- `client.ts` es el ÚNICO punto que toca el SDK. Firma:
  `callModel({ feature, model, system, messages, maxTokens }) → { text, usage }`.
  Registra `AiCall` en cada invocación (éxito o error). `maxTokens` default 2000.
- Los servicios de IA siguen el patrón del repo: lógica en `service.ts`-style llamable tanto
  desde `/api/v1/*` (Bearer PAT) como desde Server Actions (sesión) — nunca duplicar.
- En tests, `client.ts` se mockea (vi.mock) — la suite normal NO llama a la API real. Solo
  los evals (§7) llaman al modelo real, y se corren bajo demanda.

## §4 — Ensamblador de contexto (`status-context.ts`)

Función determinista (SQL puro): `buildStatusContext(projectId, userId)` →

1. **Último status:** `Artifact` más reciente del proyecto con `tipo=status_equipo` y
   `estado IN (editado, enviado)`. Su `final` (texto) va al prompt como continuidad; su
   `createdAt` define `rangoDesde` (si no hay ninguno: 14 días atrás).
2. **Avances:** Tasks del proyecto con `estatus=done` y `updatedAt >= rangoDesde`, con sus
   DodItems cumplidos.
3. **En curso / planeado:** Tasks `in_progress` + `planned` de la semana activa, con bloques
   agendados (fecha/hora) para poder decir "mañana 11 am".
4. **Minutas nuevas:** Minutas del proyecto con `fecha >= rangoDesde`, con TODOS sus items
   (los `convertido` incluidos — el status narra el acuerdo aunque ya viva como Task).
5. **Esperas y RAID abierto:** Issues `abierto` del proyecto con `responsable`,
   `fechaCompromiso`, `ultimoSeguimiento`, `numSeguimientos` — el generador convierte
   "numSeguimientos=3, desde hace 21 días" en "sigue sin respuesta de Mario".
6. **Entregables:** Deliverables con `estatus`, `fechaComprometida`, `fechaProyectada`,
   `avancePct` — alimenta la sección de facturación/entregables.
7. **Whitelist de nombres propios:** lista deduplicada de todos los nombres presentes en
   los insumos (responsables, asistentes, títulos). Va al prompt Y a los evals (§7).

Devuelve un objeto serializable que se guarda tal cual en `Artifact.insumos` (trazabilidad:
qué sabía el sistema cuando generó ese borrador).

## §5 — Contrato del prompt (`prompts/status-equipo.ts`)

Estructura del system prompt (plantilla con versión exportada, p. ej. `v1`):

1. **Rol:** "Redactas el status interno de proyecto de {usuario} para su equipo en Slack,
   en su voz exacta."
2. **Perfil de voz:** contenido de `AiProfile(userId, tipo=voice_status_equipo)` — se
   siembra a mano en Fase A (ver seed abajo) y se destila automático en Fase C.
3. **Few-shot:** 1–2 status reales previos del usuario (`Artifact.final` más recientes; en
   frío, el fixture del Apéndice A).
4. **Reglas duras:**
   - PROHIBIDO incluir cualquier hecho, nombre, fecha o número que no esté en los insumos.
     Lo que no está capturado NO existe (ese es el incentivo de captura).
   - Nombres propios permitidos: exclusivamente los de la whitelist.
   - Si una sección no tiene insumos (p. ej. facturación sin novedades), se omite — no se
     rellena.
   - Español mexicano de negocio. Salida en texto plano estilo Slack (negritas con `*`,
     sin encabezados markdown).
5. **Insumos:** el JSON de §4, serializado legible.

**Seed inicial del perfil de voz de Mau** (crear vía script de seed como
`AiProfile { userId: mau, tipo: "voice_status_equipo" }`, destilado de su status real):

```json
{
  "estructura": [
    "Saludo breve tipo 'Equipo, les doy update del proyecto'",
    "Secciones en negritas: 'Avances y pendientes internos' / 'Acuerdos de la reunión de status' / 'Facturación'",
    "Un bullet por workstream: nombre en negrita + qué pasó (pasado) + qué sigue + quién"
  ],
  "movimientos_caracteristicos": [
    "Esperas: 'Sigo sin respuesta de X sobre...'",
    "Delegación con mención: '@Nombre, hay que meterlo a nuestros pendientes'",
    "Preguntas al equipo inline: '¿Cómo ves?', 'o ven algo adicional para...?'",
    "Cierre de temas abiertos: 'lo vamos platicando'",
    "Compromisos propios: 'Quedó en nosotros...'",
    "Cierre del mensaje: '@X, @Y — si se me fue algo, adelante'"
  ],
  "tono": "Directo, profesional-cercano, sin corporativismo; una idea por bullet; sin bullets anidados",
  "evitar": ["Encabezados markdown formales", "Lenguaje de reporte ejecutivo", "Adjetivos de relleno"]
}
```

Flujo de generación (`generate-status.ts`): `buildStatusContext` → armar prompt → `callModel`
(GENERATE) → crear `Artifact { borrador, insumos, modelo, promptVersion, estado: borrador }`
→ devolver al caller. La edición posterior es `PATCH` del artifact (`final`, `estado`).

## §6 — Fase A: plan de ejecución (para Sonnet)

Contratos de UX medibles (mismo estilo del diseño general): capturar un item de minuta
**≤10 seg**; status end-to-end (click → texto pegado en Slack) **≤10 min** incluyendo edición.

### Tarea 1: Schema + seed
- Agregar modelos/enums de §2 (incluidas extensiones a Issue/Task y relaciones inversas).
- `npx prisma db push --accept-data-loss` + `npx prisma generate`.
- Script `scripts/seed-ai-profile.ts`: inserta el perfil de voz de Mau (§5) idempotente
  (upsert por `@@unique`).

### Tarea 2: Servicios + API de minutas (TDD)
- `src/lib/minutas/service.ts`: crear minuta (con blockId O calendarEventId O suelta),
  CRUD de items, y `promoteItem(itemId, destino)`:
  - `pendiente_nuestro` | `actividad_nueva` → Task (estatus backlog — cae al inbox
    existente; hereda projectId; si `actividad_nueva`, `alcance` se pregunta en UI con
    default `sow`).
  - `pendiente_cliente` | `riesgo` | `solicitud_data` → Issue (tipo mapeado:
    pendiente/riesgo/pendiente con tema="data"; responsable y fechaCompromiso copiados).
  - `acuerdo` | `decision` → Issue tipo acuerdo/decision (registro RAID, sin owner).
  - El item queda `estado=convertido` con el FK al destino. NUNCA se borra.
- Rutas `/api/v1/projects/:id/minutas` (GET/POST), `/api/v1/minutas/:id/items` (POST),
  `/api/v1/minuta-items/:id` (PATCH), `/api/v1/minuta-items/:id/promote` (POST) — Bearer
  PAT igual que el resto de v1.
- Tests contra Neon escopados por userId (regla del repo — `deleteTestUser`).

### Tarea 3: Capa IA base
- `@anthropic-ai/sdk`, env, `client.ts` con logging a `AiCall`, `models.ts`, mock helper
  para tests.

### Tarea 4: Ensamblador de contexto (TDD)
- `status-context.ts` según §4. Tests: ventana rangoDesde correcta con y sin status previo;
  whitelist completa; items convertidos incluidos.

### Tarea 5: Generación + ciclo de vida del Artifact (TDD, IA mockeada)
- `generate-status.ts` + rutas: `POST /api/v1/projects/:id/artifacts/status-equipo`,
  `GET /api/v1/artifacts/:id`, `PATCH /api/v1/artifacts/:id` (final/estado).
- Tests: artifact persiste borrador+insumos+promptVersion; PATCH captura final sin tocar
  borrador; estado enviado registra el timestamp de aceptación (updatedAt).

### Tarea 6: UI de captura — Minuta en /dia
- En cada bloque `tipo=junta` (y CalendarEvents bloqueantes): botón "Minuta" → drawer:
  chips de tipo (los 8 de §2, con los 5 frecuentes primero) + textarea + responsable y
  fecha opcionales. Agregar item = 1 interacción; el drawer permanece abierto para el
  siguiente item.
- Asistentes: chips de texto libre con sugerencias de asistentes de minutas previas del
  proyecto.
- Nudge pasivo: al marcar `done` un bloque junta sin minuta, badge "¿Minuta?" en el bloque
  (sin modal bloqueante — el flujo del día es sagrado).
- Respetar reglas aprendidas del repo (nada de Date.now() en initial state, objetos planos
  a client components).

### Tarea 7: UI del generador — vista Proyecto
- Sección "Minutas" en la vista del proyecto: lista por fecha con items y estado.
- Botón "Status para equipo": genera (spinner honesto — tarda segundos), muestra el
  borrador en textarea editable + panel lateral de insumos usados (trazabilidad visible).
- Botón "Copiar para Slack": copia el texto actual, y si difiere del borrador guarda
  `final` + `estado=enviado`; si no difiere, `estado=enviado` con `final=borrador`.
- Historial de status del proyecto (Artifacts) debajo.

### Tarea 8: Evals (golden set)
- `tests/ai/fixtures/`: (a) el status real de Mau del 15-jul (Apéndice A) como referencia
  de voz; (b) un contexto de insumos reconstruido de la semana W29 de Liverpool.
- `tests/ai/status-eval.test.ts` (se corre bajo demanda con `EVAL=1`, no en la suite
  normal): genera un borrador real y verifica **determinísticamente**:
  1. Cobertura: cada Issue abierto con responsable aparece (match por responsable).
  2. Cero alucinación de nombres: nombres propios detectados en el borrador ⊆ whitelist.
  3. Estructura: existe sección de avances; si hay minutas nuevas, existe sección de
     acuerdos.
  4. Continuidad: si el status previo menciona una espera aún abierta, el nuevo también.
- Sin LLM-judge en v1 (diferido a Fase C si las verificaciones deterministas se quedan
  cortas).

### Tarea 9: Verificación integral
- Flujo completo en preview (puerto 3010, `wtw-app-dev`): capturar minuta en una junta de
  hoy → promover 2 items → generar status → editar → copiar. Cronometrar contra los
  contratos de UX. `npx vitest run` completo. Actualizar CLAUDE.md del repo (sección
  Estado del roadmap) y la memoria `project_wtw_app.md`.

**Orden de dependencias:** 1 → (2, 3 en paralelo) → 4 → 5 → (6, 7 en paralelo) → 8 → 9.

## §7 — Evaluación y métricas de éxito

| Métrica | Baseline | Objetivo |
|---|---|---|
| Tiempo de producir el status semanal | 45–60 min | < 10 min |
| Compromisos de junta perdidos | desconocido (mueren en Slack) | 0 — todo item tiene destino |
| Ediciones por borrador (diff borrador→final) | — | tendencia a ≤2 tras ~15 ciclos |
| Costo IA por status | — | < $0.05 USD (visible en AiCall) |
| Ratio carga/capacidad semanal de Mau | actual | **no empeora** por operar el PMO |

La última es la que protege el alma del producto.

## §8 — Roadmap B–D (visión; fundaciones ya sembradas en Fase A)

**Fase B — Señales (SQL puro, sin LLM):**
- Analytics de rutina sobre TimeEntry existente: sesgo de estimación por
  proyecto/herramienta/tipo, patrones horarios de bloques profundos completados, tasa de
  carry por tarea ("la has movido 4 veces — ¿la partimos?").
- Pipeline entregable→cobro: nuevo campo `cobroEstatus` en Deliverable
  (`pendiente → carta_enviada → firmado → facturado → pagado`) — enum NUEVO, no tocar
  `DeliverableStatus` existente. Vista pipeline con días por etapa.
- Vista "¿Quién me debe qué?": Issues abiertos agrupados por responsable, ordenados por
  antigüedad, botón "registrar seguimiento" (incrementa numSeguimientos + timestamp).

**Fase C — Perfiles y destilación:**
- Cron nocturno (Vercel cron): destila diffs de Artifacts recientes → actualiza
  `voice_status_equipo` (versionado; el usuario ve y edita el perfil en "Mi perfil IA");
  refresca `project_brief` por proyecto (stakeholders desde asistentes de minutas,
  decisiones, hilos abiertos).
- Brief pre-junta: el calendario ya sabe la próxima junta → 1 click →
  `ArtifactTipo=brief_junta`: acuerdos previos que tocan a esos asistentes, esperas
  vencidas de ellos, decisiones abiertas que empujar. Mismos insumos, otro prompt.
- Ciclo de vida de `solicitud_data`: estados pedida → prometida → recibida → validada →
  con brechas (la mitad de los riesgos históricos de Liverpool son data recibida sin
  validar).
- Clasificación de texto libre: `Minuta.notas` (dictado/pegado) → Haiku propone items →
  usuario confirma. Cada corrección es señal para el perfil.

**Fase D — Proactivo:**
- `/wtw-semana` informado por RoutineProfile (propone trabajo profundo donde
  históricamente se completa).
- Ingesta de transcripciones de Teams → borrador de minuta completo (resolver
  confidencialidad del cliente antes: dónde se procesa, qué se persiste).
- Alerta de change control: horas no-SOW acumuladas por proyecto cruzan umbral → sugerir
  registro formal de cambio (Issue tipo cambio) ANTES de tener que explicar un retraso.
- Status por audiencia adicional (`status_cliente_texto` narrativo para el portal).

## §9 — Fuera de alcance (explícito, no olvidado)

Gantt completo, motor de dependencias entre tareas, RACI formal, EVM (ya descartados por
YAGNI en el diseño general); fine-tuning de modelos; envío automático a Slack (la app nunca
publica sola); ingesta de transcripts (Fase D, gated por confidencialidad); LLM-judge en
evals (v1 determinista).

---

## Apéndice A — Golden reference: status real de Mau (2026-07-15, Liverpool ET)

Fixture de voz para few-shot y evals (`tests/ai/fixtures/status-2026-07-15-liverpool.md`).
Texto íntegro tal como se envió al equipo:

```
Equipo, les doy update del proyecto

Avances y pendientes internos:

Forecast de demanda 2026: Anoche cerramos con Kevin la validación de supuestos de viajes.
Alex y yo generamos dos forecasts con metodologías distintas (con Claude); Alex está
ajustando el gemelo y corriendo la data 2026. Con los resultados de las corridas elegiremos
el forecast de mejor comportamiento.
KPIs: Con el forecast a nivel viaje ya disponible, sigue calcular los KPIs y el comparativo
vs 2025 y vs presupuesto.
Full vs Sencillo: YTD 2026 el total está en 56% Full; en las 14 ubicaciones seleccionadas
(TDs + CRs) en 58%, y viendo solo los 14 CRs en 63%. Los principales offenders son GDL,
León y MTY (~45% Full). Estoy indagando las causas raíz con Sabino/Noe, ya que difiere con
el comportamiento que nos habían dicho.
Tiempos de descarga (ventanas CRs): Con la base actualizada, el % de arribo fuera de
ventana es mayor (no menor, como nos habían dicho) y tiene más viajes por lo que genera un
ahorro mayor al que teníamos. Estoy terminando de revisar fórmulas y demás para asegurarme
de que si está dando eso, buscaré sesión con Emmanuel y Noé para confirmar y, en su caso,
actualizar el número de ahorro antes del próximo comité, lo vamos platicando.
TruckFill Big Ticket: Sigo sin respuesta de Mario sobre la fecha de visita para revisar las
oportunidades.
Paquetes de negociación: Mike está aplicando los ajustes derivados de la retro de Carlos.
En paralelo, corre el análisis de productividad de proveedores con data 2026 para confirmar
que el comportamiento sea similar a 2025; si no, ajustaremos los % de asignación en los
paquetes.

Acuerdos de la reunión de status

TruckFill: Carlos reiteró que los hallazgos/quick wins se entreguen solo como
recomendación, sin profundizar el análisis, y que el foco siga en los paquetes de
negociación.
Ventanas nocturnas: Noé compartirá hoy por la tarde el listado de las 56 TDs que cambiarán
a ventana nocturna. Las incluiremos en la simulación y regresaremos con recomendaciones de
tiendas adicionales que convenga mover (esperan alguna en el Sureste). Con esto ya no es
necesaria la sesión con Nayeli, o ven algo adicional para si perseguir la sesión con ella?
@Miguel Jimenez @Alejandro Nila
Tarifas Spot/Dedicados: Kevin pidió reunión (mañana 11 am) para revisarlas y usar de base
nuestro forecast 2026 a nivel viaje, como insumo para que calcule el presupuesto 2027.
Sensibilidad de costo: Carlos pidió analizar el costo proyectado con el forecast 2026 vs el
presupuesto 2026. Los viajes proyectados están -3% vs presupuesto, por lo que deberíamos
ver al menos una reducción mínima en costo.
Visitas a CRs (MTY, GDL, PUE y VHM): Quedó en nosotros proponer fechas para las visitas de
sensibilidad de operación. @Miguel Jimenez, hay que meterlo a nuestros pendientes y tiempos.
Plan de trabajo actualizado: Reporté el aplazo de 2 semanas derivado de las iniciativas
adicionales (reloj operativo, eficiencia operativa y actualización de data a 2026). Alan
dijo que debe validarlo internamente con Carlos y Moisés para registrarlo como cambio
formal en su tracking. @Miguel Jimenez, propongo buscar mañana a Moisés en su oficina: es
quien menos contexto tiene (no estuvo en la sesión) y Carlos no estará, aunque para él creo
que es transparente. ¿Cómo ves?

Facturación

Anticipo: Luis Ricardo (Finanzas) confirmó que ya está autorizado y firmado; hoy comparten
comprobante de liberación y fecha de pago. @Clau, ¿te llegó algo?
Línea base de gasto: En cuanto la carta esté lista (@Clau), busco a Noé para agendar sesión
con él y Kevin y validar el entregable — o, si aplica, enviar directo carta + entregable —
y pasarlo a firma con Carlos/Moi para solicitar el pago.
Paquetes de negociación: Mañana 9 am es la revisión con José Daza y Carlos. Con eso
podremos armar la carta del entregable, pasar a firmas y solicitar el pago.

@Miguel Jimenez, @Guillermo Godoy — si se me fue algo, adelante
```

Nota para evals: de este texto se derivan los casos de prueba de cobertura (esperas:
Mario/TruckFill; continuidad entre status consecutivos) y la whitelist de nombres del
contexto W29.
