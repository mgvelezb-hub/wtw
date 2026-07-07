# Plan Fase 4 — Proyectos + Desarrollo (WTW App v2)

**Diseño fuente:** `docs/plans/2026-07-06-wtw-app-design.md` (§4, §6, §8) · **Fecha:** 2026-07-07

## Alcance y recortes conscientes

- **Notificaciones push PWA**: requieren VAPID keys + `PushSubscription` model + infraestructura de envío — infra separada de valor marginal comparado con el resto de la fase. **Se difiere explícitamente**, no se cae por descuido.
- **Edición de TimeEntries**: se agrega mínima (crear entrada manual + corregir una existente), suficiente para honestidad de datos sin construir un editor completo de historial.

## Mapa de archivos

```
src/app/api/v1/utilizacion/service.ts      # 3 cubetas: facturable/aliado/interno (TDD)
src/app/api/v1/asignaciones/service.ts     # cumplimiento Allocation vs real (TDD)
src/app/historico/service.ts               # semanas cerradas + factor + wins (TDD)
src/app/historico/page.tsx
src/app/proyectos/service.ts               # lista proyectos + carga + utilización (TDD)
src/app/proyectos/page.tsx + ProyectosBoard.tsx
src/app/proyectos/[id]/service.ts          # detalle: entregables + semáforo fechas (TDD)
src/app/proyectos/[id]/page.tsx
src/app/desarrollo/service.ts              # coverage de competencias vs evidencia (TDD)
src/app/desarrollo/page.tsx
src/app/dia/timeentry-actions.ts           # crear/corregir TimeEntry manual
tests/utilizacion.test.ts, asignaciones.test.ts, historico.test.ts, proyectos.test.ts, proyecto-detalle.test.ts, desarrollo.test.ts
```

---

### Tarea 1: Utilización — 3 cubetas (TDD)

**Tests** (`tests/utilizacion.test.ts`):
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { computeUtilizacion } from '@/app/api/v1/utilizacion/service'

const TEST_EMAIL = 'test-util@vp.mx'
beforeEach(() => deleteTestUser(TEST_EMAIL))

async function entry(userId: string, taskId: string, seconds: number) {
  await prisma.timeEntry.create({ data: { userId, taskId, startedAt: new Date(), stoppedAt: new Date(), seconds } })
}

describe('computeUtilizacion', () => {
  it('separa horas en facturable / aliado / interno', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const facturable = await prisma.project.create({ data: { userId: user.id, nombre: 'Liverpool', tipo: 'facturable' } })
    const interno = await prisma.project.create({ data: { userId: user.id, nombre: 'VP', tipo: 'interno' } })

    const t1 = await prisma.task.create({ data: { userId: user.id, projectId: facturable.id, titulo: 'sow', alcance: 'sow' } })
    const t2 = await prisma.task.create({ data: { userId: user.id, projectId: facturable.id, titulo: 'aliado', alcance: 'aliado' } })
    const t3 = await prisma.task.create({ data: { userId: user.id, projectId: interno.id, titulo: 'interno' } })

    await entry(user.id, t1.id, 3600) // 1h facturable
    await entry(user.id, t2.id, 1800) // 0.5h aliado
    await entry(user.id, t3.id, 900) // 0.25h interno

    const util = await computeUtilizacion(user.id)
    expect(util.facturableHoras).toBeCloseTo(1, 2)
    expect(util.aliadoHoras).toBeCloseTo(0.5, 2)
    expect(util.internoHoras).toBeCloseTo(0.25, 2)
    expect(util.pctFacturable).toBeCloseTo((1 / 1.75) * 100, 1)
  })

  it('devuelve ceros si no hay TimeEntries', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const util = await computeUtilizacion(user.id)
    expect(util.facturableHoras).toBe(0)
    expect(util.pctFacturable).toBe(0)
  })
})
```

**Implementación** (`src/app/api/v1/utilizacion/service.ts`):
```ts
import { prisma } from '@/lib/prisma'

export type Utilizacion = { facturableHoras: number; aliadoHoras: number; internoHoras: number; pctFacturable: number }

export async function computeUtilizacion(userId: string, desde?: Date, hasta?: Date): Promise<Utilizacion> {
  const entries = await prisma.timeEntry.findMany({
    where: {
      userId,
      stoppedAt: { not: null },
      ...(desde && hasta ? { startedAt: { gte: desde, lte: hasta } } : {}),
    },
    include: { task: { include: { project: true } } },
  })

  let facturableSec = 0
  let aliadoSec = 0
  let internoSec = 0

  for (const e of entries) {
    const project = e.task.project
    if (e.task.alcance === 'aliado') aliadoSec += e.seconds
    else if (project?.tipo === 'facturable') facturableSec += e.seconds
    else internoSec += e.seconds
  }

  const totalSec = facturableSec + aliadoSec + internoSec
  return {
    facturableHoras: facturableSec / 3600,
    aliadoHoras: aliadoSec / 3600,
    internoHoras: internoSec / 3600,
    pctFacturable: totalSec > 0 ? (facturableSec / totalSec) * 100 : 0,
  }
}
```

**Verificación:** RED→GREEN, `git commit "feat(utilizacion): 3 cubetas facturable/aliado/interno (Tarea 1)"`

---

### Tarea 2: Cumplimiento de asignación (TDD)

**Tests** (`tests/asignaciones.test.ts`):
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { complianceForWeek } from '@/app/api/v1/asignaciones/service'

const TEST_EMAIL = 'test-alloc@vp.mx'
beforeEach(() => deleteTestUser(TEST_EMAIL))

describe('complianceForWeek', () => {
  it('compara % objetivo vigente vs % real dedicado en la semana', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const proj = await prisma.project.create({ data: { userId: user.id, nombre: 'Liverpool' } })
    await prisma.allocation.create({ data: { userId: user.id, projectId: proj.id, pct: 50, vigenteDesde: new Date('2026-01-01') } })

    const task = await prisma.task.create({ data: { userId: user.id, projectId: proj.id, titulo: 'x' } })
    await prisma.timeEntry.create({ data: { userId: user.id, taskId: task.id, startedAt: new Date(), stoppedAt: new Date(), seconds: 3600 } })
    const otherTask = await prisma.task.create({ data: { userId: user.id, titulo: 'y' } })
    await prisma.timeEntry.create({ data: { userId: user.id, taskId: otherTask.id, startedAt: new Date(), stoppedAt: new Date(), seconds: 3600 } })

    const compliance = await complianceForWeek(user.id)
    const liverpool = compliance.find((c) => c.projectNombre === 'Liverpool')!
    expect(liverpool.pctObjetivo).toBe(50)
    expect(liverpool.pctReal).toBeCloseTo(50, 1) // 1h de 2h totales
  })

  it('ignora allocations ya no vigentes (vigenteHasta en el pasado)', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const proj = await prisma.project.create({ data: { userId: user.id, nombre: 'Cuervo' } })
    await prisma.allocation.create({
      data: { userId: user.id, projectId: proj.id, pct: 100, vigenteDesde: new Date('2025-01-01'), vigenteHasta: new Date('2025-06-01') },
    })
    const compliance = await complianceForWeek(user.id)
    expect(compliance.find((c) => c.projectNombre === 'Cuervo')).toBeUndefined()
  })
})
```

**Implementación** (`src/app/api/v1/asignaciones/service.ts`):
```ts
import { prisma } from '@/lib/prisma'

export type Compliance = { projectId: string; projectNombre: string; pctObjetivo: number; pctReal: number }

export async function complianceForWeek(userId: string, ahora: Date = new Date()): Promise<Compliance[]> {
  const allocations = await prisma.allocation.findMany({
    where: { userId, vigenteDesde: { lte: ahora }, OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: ahora } }] },
    include: { project: true },
  })
  if (allocations.length === 0) return []

  const entries = await prisma.timeEntry.findMany({
    where: { userId, stoppedAt: { not: null } },
    include: { task: true },
  })
  const totalSec = entries.reduce((s, e) => s + e.seconds, 0)

  return allocations.map((a) => {
    const projectSec = entries.filter((e) => e.task.projectId === a.projectId).reduce((s, e) => s + e.seconds, 0)
    return {
      projectId: a.projectId,
      projectNombre: a.project.nombre,
      pctObjetivo: a.pct,
      pctReal: totalSec > 0 ? (projectSec / totalSec) * 100 : 0,
    }
  })
}
```

**Verificación:** RED→GREEN, `git commit "feat(asignaciones): cumplimiento % objetivo vs real (Tarea 2)"`

---

### Tarea 3: Histórico de semanas (TDD)

**Tests** (`tests/historico.test.ts`):
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { getHistorico } from '@/app/historico/service'

const TEST_EMAIL = 'test-historico@vp.mx'
beforeEach(() => deleteTestUser(TEST_EMAIL))

describe('getHistorico', () => {
  it('lista semanas cerradas con factor, wins logrados y ratio real/estimado', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const week = await prisma.week.create({
      data: { userId: user.id, isoWeek: '2026-W20', rangoInicio: new Date('2026-05-11'), rangoFin: new Date('2026-05-15'), factorUsado: 1.4, estatus: 'closed' },
    })
    await prisma.win.create({ data: { weekId: week.id, posicion: 1, titulo: 'W1', estatus: 'logrado' } })
    await prisma.win.create({ data: { weekId: week.id, posicion: 2, titulo: 'W2', estatus: 'pendiente' } })

    const historico = await getHistorico(user.id)
    expect(historico).toHaveLength(1)
    expect(historico[0].isoWeek).toBe('2026-W20')
    expect(historico[0].winsLogrados).toBe(1)
    expect(historico[0].winsTotal).toBe(2)
  })

  it('no incluye semanas en planning/active', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    await prisma.week.create({ data: { userId: user.id, isoWeek: '2026-W28', rangoInicio: new Date(), rangoFin: new Date(), factorUsado: 1.4, estatus: 'active' } })
    expect(await getHistorico(user.id)).toHaveLength(0)
  })
})
```

**Implementación** (`src/app/historico/service.ts`):
```ts
import { prisma } from '@/lib/prisma'

export async function getHistorico(userId: string) {
  const weeks = await prisma.week.findMany({
    where: { userId, estatus: 'closed' },
    include: { wins: true },
    orderBy: { rangoInicio: 'desc' },
  })

  return weeks.map((w) => ({
    isoWeek: w.isoWeek,
    factorUsado: Number(w.factorUsado),
    winsLogrados: w.wins.filter((win) => win.estatus === 'logrado').length,
    winsTotal: w.wins.length,
  }))
}
```

**Verificación:** RED→GREEN, `git commit "feat(historico): semanas cerradas — factor, wins, tendencia (Tarea 3)"`

---

### Tarea 4: Vista Proyectos

**Tests** (`tests/proyectos.test.ts`):
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { listProyectosConCarga } from '@/app/proyectos/service'

const TEST_EMAIL = 'test-proy@vp.mx'
beforeEach(() => deleteTestUser(TEST_EMAIL))

describe('listProyectosConCarga', () => {
  it('suma la carga (ajustadoMin/estimadoMin) de tasks activas por proyecto', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const proj = await prisma.project.create({ data: { userId: user.id, nombre: 'Liverpool' } })
    await prisma.task.create({ data: { userId: user.id, projectId: proj.id, titulo: 'a', estimadoMin: 60, estatus: 'planned' } })
    await prisma.task.create({ data: { userId: user.id, projectId: proj.id, titulo: 'b', ajustadoMin: 120, estatus: 'in_progress' } })
    await prisma.task.create({ data: { userId: user.id, projectId: proj.id, titulo: 'c', estimadoMin: 999, estatus: 'done' } })

    const proyectos = await listProyectosConCarga(user.id)
    const liverpool = proyectos.find((p) => p.nombre === 'Liverpool')!
    expect(liverpool.cargaActivaHoras).toBeCloseTo(3, 1) // 60+120 min, la done no cuenta
  })
})
```

**Implementación** (`src/app/proyectos/service.ts`):
```ts
import { prisma } from '@/lib/prisma'

export async function listProyectosConCarga(userId: string) {
  const proyectos = await prisma.project.findMany({
    where: { userId },
    include: { tasks: { where: { estatus: { in: ['planned', 'in_progress'] } } } },
    orderBy: { nombre: 'asc' },
  })

  return proyectos.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    cliente: p.cliente,
    tipo: p.tipo,
    color: p.color,
    estatus: p.estatus,
    cargaActivaHoras: p.tasks.reduce((s, t) => s + (t.ajustadoMin ?? t.estimadoMin ?? 0), 0) / 60,
  }))
}
```

`page.tsx` + `ProyectosBoard.tsx` — Server Component lista proyectos con `listProyectosConCarga` + `computeUtilizacion` (barra facturable/aliado/interno) + `complianceForWeek` (chip % objetivo vs real por proyecto). Cada tarjeta linkea a `/proyectos/[id]`.

**Verificación:** RED→GREEN + build + browser. `git commit "feat(proyectos): vista lista — carga, utilización, cumplimiento (Tarea 4)"`

---

### Tarea 5: Detalle de proyecto — Entregables

**Tests** (`tests/proyecto-detalle.test.ts`):
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { getProyectoDetalle } from '@/app/proyectos/[id]/service'

const TEST_EMAIL = 'test-proydet@vp.mx'
beforeEach(() => deleteTestUser(TEST_EMAIL))

describe('getProyectoDetalle', () => {
  it('marca semáforo "atrasado" si fechaProyectada > fechaComprometida', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const proj = await prisma.project.create({ data: { userId: user.id, nombre: 'Liverpool' } })
    await prisma.deliverable.create({
      data: { projectId: proj.id, nombre: 'KPIs', fechaComprometida: new Date('2026-07-01'), fechaProyectada: new Date('2026-07-10'), avancePct: 40 },
    })
    const detalle = await getProyectoDetalle(user.id, proj.id)
    expect(detalle!.entregables[0].semaforo).toBe('atrasado')
  })

  it('marca "a_tiempo" si no hay fechaProyectada o es igual/anterior a la comprometida', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const proj = await prisma.project.create({ data: { userId: user.id, nombre: 'Liverpool' } })
    await prisma.deliverable.create({ data: { projectId: proj.id, nombre: 'KPIs', fechaComprometida: new Date('2026-07-10'), avancePct: 10 } })
    const detalle = await getProyectoDetalle(user.id, proj.id)
    expect(detalle!.entregables[0].semaforo).toBe('a_tiempo')
  })

  it('devuelve null si el proyecto no es del usuario', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const proj = await prisma.project.create({ data: { userId: user.id, nombre: 'X' } })
    expect(await getProyectoDetalle('otro-id', proj.id)).toBeNull()
  })
})
```

**Implementación** (`src/app/proyectos/[id]/service.ts`):
```ts
import { prisma } from '@/lib/prisma'

type Semaforo = 'a_tiempo' | 'atrasado'

export async function getProyectoDetalle(userId: string, projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { deliverables: { orderBy: { createdAt: 'asc' } }, issues: { where: { estatus: 'abierto' } } },
  })
  if (!project || project.userId !== userId) return null

  const entregables = project.deliverables.map((d) => {
    let semaforo: Semaforo = 'a_tiempo'
    if (d.fechaProyectada && d.fechaComprometida && d.fechaProyectada > d.fechaComprometida) semaforo = 'atrasado'
    return { ...d, semaforo }
  })

  return { project, entregables, issuesAbiertos: project.issues }
}
```

`page.tsx` — tabla de entregables con semáforo (🟢/🔴), avancePct, fechas; sección de Issues abiertos (RAID).

**Verificación:** RED→GREEN + build + browser. `git commit "feat(proyectos): detalle — entregables con semáforo de fechas (Tarea 5)"`

---

### Tarea 6: Desarrollo — mapa de competencias (TDD)

**Tests** (`tests/desarrollo.test.ts`):
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { getCoberturaCompetencias } from '@/app/desarrollo/service'

const TEST_EMAIL = 'test-dev@vp.mx'
beforeEach(() => deleteTestUser(TEST_EMAIL))

describe('getCoberturaCompetencias', () => {
  it('cuenta evidencias por competencia y marca huecos (0 evidencia)', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const comp1 = await prisma.competency.create({ data: { tipo: 'rol', grupo: 'La mano del Rey', texto: 'x', orden: 0 } })
    const comp2 = await prisma.competency.create({ data: { tipo: 'rol', grupo: 'La mano del Rey', texto: 'y', orden: 1 } })
    await prisma.evidence.create({ data: { userId: user.id, competencyId: comp1.id, nota: 'hice x' } })

    const cobertura = await getCoberturaCompetencias(user.id)
    const c1 = cobertura.find((c) => c.id === comp1.id)!
    const c2 = cobertura.find((c) => c.id === comp2.id)!
    expect(c1.evidenciaCount).toBe(1)
    expect(c2.evidenciaCount).toBe(0)
  })
})
```

**Implementación** (`src/app/desarrollo/service.ts`):
```ts
import { prisma } from '@/lib/prisma'

export async function getCoberturaCompetencias(userId: string) {
  const competencias = await prisma.competency.findMany({
    include: { evidences: { where: { userId } } },
    orderBy: [{ tipo: 'asc' }, { grupo: 'asc' }, { orden: 'asc' }],
  })
  return competencias.map((c) => ({
    id: c.id,
    tipo: c.tipo,
    grupo: c.grupo,
    texto: c.texto,
    evidenciaCount: c.evidences.length,
  }))
}
```

`page.tsx` — agrupa por `tipo`/`grupo`, muestra cada competencia con su conteo de evidencia; resalta en ámbar las que tienen 0 (huecos de cara al nivel objetivo). Trae también `user.nivelObjetivo` para el encabezado ("Cobertura hacia Gerente").

**Verificación:** RED→GREEN + build + browser. `git commit "feat(desarrollo): mapa de cobertura de competencias (Tarea 6)"`

---

### Tarea 7: Edición manual de TimeEntry

**Objetivo:** Honestidad de datos — permitir agregar una entrada olvidada o corregir una existente, marcada `manual: true`.

**Archivos:** `src/app/dia/timeentry-actions.ts`, edita `src/app/dia/service.ts` (agrega `createManualEntry`, `editEntry`)

**Implementación** — agregar a `src/app/dia/service.ts`:
```ts
export async function createManualEntry(taskId: string, userId: string, seconds: number) {
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task || task.userId !== userId) throw new Error('task no encontrada')
  const now = new Date()
  return prisma.timeEntry.create({
    data: { userId, taskId, startedAt: new Date(now.getTime() - seconds * 1000), stoppedAt: now, seconds, manual: true },
  })
}

export async function editEntry(entryId: string, userId: string, seconds: number) {
  const entry = await prisma.timeEntry.findUnique({ where: { id: entryId } })
  if (!entry || entry.userId !== userId) throw new Error('entry no encontrado')
  return prisma.timeEntry.update({ where: { id: entryId }, data: { seconds, manual: true } })
}
```

`timeentry-actions.ts` — Server Actions delgadas (`createManualEntryAction`, `editEntryAction`) con `revalidatePath('/dia')`, mismo patrón que `dia/actions.ts`.

UI: en `BlockCard` de `DiaBoard.tsx`, agregar un botón pequeño "✎" junto al tiempo mostrado que abre un prompt simple (`window.prompt` es aceptable para v1 — no bloquear en un modal completo) pidiendo minutos reales; llama `editEntryAction` si ya hay `accumulatedSeconds > 0`, o `createManualEntryAction` si no.

**Verificación:** build + browser (agregar tiempo manual a una tarea sin cronómetro previo, confirmar que aparece marcado `manual` en DB). `git commit "feat(dia): edición manual de TimeEntry — honestidad de datos (Tarea 7)"`

---

### Tarea 8: Verificación integral

1. `npx vitest run` completo, `npm run build`.
2. Navegador: `/proyectos` (ver los 4 proyectos con carga y utilización), abrir `/proyectos/[id]` de Liverpool (ver los 2 deliverables sembrados en Fase 1, semáforo), `/historico` (vacío hasta que haya semanas `closed` — confirmar que no truena), `/desarrollo` (ver 20+28 competencias con evidenciaCount en 0, sin evidencia sembrada todavía).
3. Screenshot de `/proyectos` y `/desarrollo`.

**Verificación:** todo verde, git commit final si hubo ajustes.

---

## Orden de dependencias

1, 2, 3 independientes entre sí. 4 depende de 1+2. 5 independiente (usa Deliverable de Fase 1). 6 independiente. 7 depende del `dia/service.ts` de Fase 2. 8 depende de todas.

## Fuera de esta fase

Notificaciones push PWA (VAPID + PushSubscription — infra separada, se retoma si se siente la falta), export de bitácora de promoción (Fase 6), edición de Allocation desde la UI (se crea vía script/DB directo por ahora, igual que en Fase 1).
