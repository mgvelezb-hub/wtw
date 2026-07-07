# Plan Fase 3 — Semana + Skills + Calendario (WTW App v2)

**Diseño fuente:** `docs/plans/2026-07-06-wtw-app-design.md` (§3, §4, §6) · **Fecha:** 2026-07-07

## Alcance y recortes conscientes (YAGNI)

- **ICS**: parser propio de `VEVENT` (DTSTART/DTEND/SUMMARY), **sin expansión de RRULE** (eventos recurrentes). Cubre el caso real (calendario de Outlook exportado); recurrencia queda para cuando se sienta la falta.
- **Factor de realismo**: NO se importa histórico de Obsidian (mezclar reconstrucción manual con TimeEntries reales ensucia el ledger). `factorManual` sigue siendo la fuente hasta acumular ≥3 semanas de TimeEntries reales; entonces `computeFactorRealismo` toma el promedio móvil real.
- **Settings** entra aquí (no tenía fase asignada) porque el calendario necesita `icsUrl` configurable.

## Mapa de archivos

```
src/lib/ics.ts                    # parser ICS puro (TDD)
src/lib/factor-realismo.ts        # cálculo del factor (TDD)
src/app/api/v1/calendar/service.ts  # sync: fetch ICS → upsert CalendarEvent
src/app/api/v1/calendar/route.ts    # POST sync (PAT)
src/app/api/v1/capacity/service.ts  # huecos_libres por día (TDD)
src/app/api/v1/capacity/[isoWeek]/route.ts
src/app/api/v1/evidence/route.ts    # POST evidencia, GET competencias
src/app/semana/service.ts         # getWeekView (wins+capacidad+bloques)
src/app/semana/page.tsx
src/app/inbox/service.ts          # listInbox, triageTask (TDD)
src/app/inbox/actions.ts
src/app/inbox/page.tsx + InboxBoard.tsx
src/app/settings/actions.ts
src/app/settings/page.tsx
tests/ics.test.ts, factor-realismo.test.ts, capacity-service.test.ts, inbox-service.test.ts
~/.claude/skills/wtw-semana/SKILL.md    # reescrito → API
~/.claude/skills/wtw-dia/SKILL.md       # reescrito → API
~/.claude/skills/wtw-comprometer/SKILL.md # reescrito → API
~/.claude/skills/wtw-portal/            # eliminado (muere)
```

---

### Tarea 1: Parser ICS puro (TDD)

**Tests** (`tests/ics.test.ts`):
```ts
import { describe, it, expect } from 'vitest'
import { parseIcs } from '@/lib/ics'

const SAMPLE = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:evt1@test
DTSTART:20260707T140000Z
DTEND:20260707T150000Z
SUMMARY:Junta con cliente
END:VEVENT
BEGIN:VEVENT
UID:evt2@test
DTSTART;VALUE=DATE:20260708
DTEND;VALUE=DATE:20260709
SUMMARY:Día completo
END:VEVENT
END:VCALENDAR`

describe('parseIcs', () => {
  it('extrae eventos con hora (UTC → local fields)', () => {
    const events = parseIcs(SAMPLE)
    const evt = events.find((e) => e.uid === 'evt1@test')!
    expect(evt.summary).toBe('Junta con cliente')
    expect(evt.allDay).toBe(false)
  })
  it('detecta eventos de día completo (VALUE=DATE)', () => {
    const events = parseIcs(SAMPLE)
    const evt = events.find((e) => e.uid === 'evt2@test')!
    expect(evt.allDay).toBe(true)
  })
  it('ignora líneas plegadas (folding) reuniéndolas', () => {
    const folded = SAMPLE.replace('SUMMARY:Junta con cliente', 'SUMMARY:Junta con\r\n cliente largo')
    const events = parseIcs(folded)
    expect(events[0].summary).toBe('Junta con cliente largo')
  })
  it('devuelve array vacío si no hay VEVENT', () => {
    expect(parseIcs('BEGIN:VCALENDAR\nEND:VCALENDAR')).toEqual([])
  })
})
```

**Implementación** (`src/lib/ics.ts`):
```ts
export type IcsEvent = {
  uid: string
  summary: string
  start: Date
  end: Date
  allDay: boolean
}

function unfold(raw: string): string {
  return raw.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')
}

function parseIcsDate(value: string, isDateOnly: boolean): Date {
  if (isDateOnly) {
    const y = +value.slice(0, 4), m = +value.slice(4, 6), d = +value.slice(6, 8)
    return new Date(Date.UTC(y, m - 1, d))
  }
  const y = +value.slice(0, 4), m = +value.slice(4, 6), d = +value.slice(6, 8)
  const hh = +value.slice(9, 11), mm = +value.slice(11, 13), ss = +value.slice(13, 15) || 0
  return new Date(Date.UTC(y, m - 1, d, hh, mm, ss))
}

export function parseIcs(raw: string): IcsEvent[] {
  const lines = unfold(raw).split(/\r?\n/)
  const events: IcsEvent[] = []
  let cur: Partial<IcsEvent> & { startIsDate?: boolean } = {}
  let inEvent = false

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { inEvent = true; cur = {}; continue }
    if (line === 'END:VEVENT') {
      if (cur.uid && cur.start && cur.end) events.push(cur as IcsEvent)
      inEvent = false
      continue
    }
    if (!inEvent) continue

    const [rawKey, ...rest] = line.split(':')
    const value = rest.join(':')
    const [key, ...params] = rawKey.split(';')
    const isDateOnly = params.some((p) => p === 'VALUE=DATE')

    if (key === 'UID') cur.uid = value
    else if (key === 'SUMMARY') cur.summary = value
    else if (key === 'DTSTART') { cur.start = parseIcsDate(value, isDateOnly); cur.allDay = isDateOnly }
    else if (key === 'DTEND') cur.end = parseIcsDate(value, isDateOnly)
  }
  return events
}
```

**Verificación:** RED→GREEN, `git commit "feat(lib): parser ICS puro — sin RRULE (Tarea 1)"`

---

### Tarea 2: Factor de realismo (TDD)

**Tests** (`tests/factor-realismo.test.ts`):
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { computeFactorRealismo } from '@/lib/factor-realismo'

const TEST_EMAIL = 'test-factor@vp.mx'
beforeEach(() => deleteTestUser(TEST_EMAIL))

describe('computeFactorRealismo', () => {
  it('usa factorManual si hay menos de 3 semanas con datos', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x', factorManual: 1.4 } })
    expect(await computeFactorRealismo(user.id)).toBe(1.4)
  })

  it('promedia real/estimado de tasks completadas con estimadoMin cuando hay ≥3 semanas', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x', factorManual: 1.4 } })
    for (let i = 0; i < 3; i++) {
      const week = await prisma.week.create({
        data: { userId: user.id, isoWeek: `2026-W0${i + 1}`, rangoInicio: new Date('2026-01-05'), rangoFin: new Date('2026-01-09'), factorUsado: 1.4 },
      })
      const task = await prisma.task.create({
        data: { userId: user.id, weekId: week.id, titulo: `T${i}`, estimadoMin: 60, estatus: 'done' },
      })
      await prisma.timeEntry.create({ data: { userId: user.id, taskId: task.id, startedAt: new Date(), stoppedAt: new Date(), seconds: 90 * 60 } }) // 1.5x
    }
    expect(await computeFactorRealismo(user.id)).toBeCloseTo(1.5, 1)
  })
})
```

**Implementación** (`src/lib/factor-realismo.ts`):
```ts
import { prisma } from './prisma'

const MIN_SEMANAS = 3

export async function computeFactorRealismo(userId: string): Promise<number> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  const manual = user.factorManual ? Number(user.factorManual) : 1.4

  const semanas = await prisma.week.count({ where: { userId, estatus: 'closed' } })
  if (semanas < MIN_SEMANAS) return manual

  const tasks = await prisma.task.findMany({
    where: { userId, estatus: 'done', estimadoMin: { not: null } },
    include: { timeEntries: true },
  })
  const ratios = tasks
    .map((t) => {
      const real = t.timeEntries.reduce((s, e) => s + e.seconds, 0) / 60
      return real > 0 && t.estimadoMin ? real / t.estimadoMin : null
    })
    .filter((r): r is number => r !== null)

  if (ratios.length === 0) return manual
  const promedio = ratios.reduce((a, b) => a + b, 0) / ratios.length
  return Math.round((0.6 * manual + 0.4 * promedio) * 100) / 100
}
```

**Verificación:** RED→GREEN, `git commit "feat(lib): computeFactorRealismo — suaviza manual con real (Tarea 2)"`

---

### Tarea 3: Capacidad del día/semana (TDD)

**Objetivo:** Dado userId + rango de fechas, calcular huecos libres = horario laboral − comida − CalendarEvents − DayOverrides.

**Tests** (`tests/capacity-service.test.ts`):
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { capacityForWeek } from '@/app/api/v1/capacity/service'

const TEST_EMAIL = 'test-cap@vp.mx'
beforeEach(() => deleteTestUser(TEST_EMAIL))

describe('capacityForWeek', () => {
  it('calcula horas libres = horario - comida - eventos, para cada día lun-vie', async () => {
    const user = await prisma.user.create({
      data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x', horarioInicio: '09:00', horarioFin: '18:00', comidaInicio: '14:00', comidaFin: '15:00', bufferPct: 25 },
    })
    await prisma.calendarEvent.create({
      data: { userId: user.id, externalId: 'e1', fecha: new Date('2026-07-06'), inicio: '10:00', fin: '11:00', titulo: 'Junta' },
    })
    const cap = await capacityForWeek(user.id, '2026-W28')
    const lunes = cap.dias.find((d) => d.fecha === '2026-07-06')!
    expect(lunes.horasLibres).toBeCloseTo(7, 1) // 9h jornada - 1h comida - 1h junta
    expect(cap.trabajablePlaneable).toBeCloseTo(cap.trabajableTotal * 0.75, 1)
  })

  it('un DayOverride sin horario marca el día como no laborable (0h)', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    await prisma.dayOverride.create({ data: { userId: user.id, fecha: new Date('2026-07-06'), nota: 'Festivo' } })
    const cap = await capacityForWeek(user.id, '2026-W28')
    expect(cap.dias.find((d) => d.fecha === '2026-07-06')!.horasLibres).toBe(0)
  })
})
```

**Implementación** (`src/app/api/v1/capacity/service.ts`):
```ts
import { prisma } from '@/lib/prisma'
import { weekRange } from '@/lib/dates'

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export type DiaCapacidad = { fecha: string; horasLibres: number }
export type CapacidadSemana = { dias: DiaCapacidad[]; trabajableTotal: number; trabajablePlaneable: number }

export async function capacityForWeek(userId: string, isoWeek: string): Promise<CapacidadSemana> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  const { inicio } = weekRange(isoWeek)

  const dias: DiaCapacidad[] = []
  for (let i = 0; i < 5; i++) {
    const fecha = new Date(inicio)
    fecha.setUTCDate(fecha.getUTCDate() + i)
    const fechaStr = fecha.toISOString().slice(0, 10)

    const override = await prisma.dayOverride.findUnique({ where: { userId_fecha: { userId, fecha } } })
    if (override && !override.inicio) { dias.push({ fecha: fechaStr, horasLibres: 0 }); continue }

    const horarioInicio = override?.inicio ?? user.horarioInicio
    const horarioFin = override?.fin ?? user.horarioFin
    let libreMin = toMin(horarioFin) - toMin(horarioInicio) - (toMin(user.comidaFin) - toMin(user.comidaInicio))

    const eventos = await prisma.calendarEvent.findMany({ where: { userId, fecha } })
    for (const e of eventos) libreMin -= toMin(e.fin) - toMin(e.inicio)

    dias.push({ fecha: fechaStr, horasLibres: Math.max(0, libreMin) / 60 })
  }

  const trabajableTotal = dias.reduce((s, d) => s + d.horasLibres, 0)
  return { dias, trabajableTotal, trabajablePlaneable: trabajableTotal * (1 - user.bufferPct / 100) }
}
```

**Verificación:** RED→GREEN, `git commit "feat(capacity): huecos libres por día — horario, comida, eventos, overrides (Tarea 3)"`

---

### Tarea 4: Sync de calendario + API

**Archivos:** `src/app/api/v1/calendar/service.ts`, `src/app/api/v1/calendar/route.ts`, `src/app/api/v1/capacity/[isoWeek]/route.ts`

**Implementación:**
```ts
// calendar/service.ts
import { prisma } from '@/lib/prisma'
import { parseIcs } from '@/lib/ics'

function hhmm(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export async function syncCalendar(userId: string): Promise<{ synced: number }> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  if (!user.icsUrl) throw new Error('icsUrl no configurada')

  const res = await fetch(user.icsUrl)
  if (!res.ok) throw new Error(`ICS fetch falló: ${res.status}`)
  const events = parseIcs(await res.text()).filter((e) => !e.allDay)

  for (const e of events) {
    await prisma.calendarEvent.upsert({
      where: { userId_externalId: { userId, externalId: e.uid } },
      create: { userId, externalId: e.uid, fecha: new Date(e.start.toISOString().slice(0, 10)), inicio: hhmm(e.start), fin: hhmm(e.end), titulo: e.summary },
      update: { fecha: new Date(e.start.toISOString().slice(0, 10)), inicio: hhmm(e.start), fin: hhmm(e.end), titulo: e.summary },
    })
  }
  return { synced: events.length }
}
```
```ts
// calendar/route.ts
import { NextResponse } from 'next/server'
import { apiUser } from '@/lib/api-auth'
import { syncCalendar } from './service'

export async function POST(req: Request) {
  const user = await apiUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await syncCalendar(user.id))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 })
  }
}
```
```ts
// capacity/[isoWeek]/route.ts
import { NextResponse } from 'next/server'
import { apiUser } from '@/lib/api-auth'
import { capacityForWeek } from '../service'

export async function GET(req: Request, { params }: { params: Promise<{ isoWeek: string }> }) {
  const user = await apiUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { isoWeek } = await params
  return NextResponse.json(await capacityForWeek(user.id, isoWeek))
}
```

**Verificación:** `npm run build` limpio. `git commit "feat(api): sync calendario ICS + endpoint de capacidad (Tarea 4)"`

---

### Tarea 5: Evidencia de competencias — API

**Archivos:** `src/app/api/v1/evidence/route.ts`, `src/app/api/v1/competencies/route.ts`

**Implementación:**
```ts
// competencies/route.ts
import { NextResponse } from 'next/server'
import { apiUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const user = await apiUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const competencias = await prisma.competency.findMany({ orderBy: [{ tipo: 'asc' }, { grupo: 'asc' }, { orden: 'asc' }] })
  return NextResponse.json({ competencias })
}
```
```ts
// evidence/route.ts
import { NextResponse } from 'next/server'
import { apiUser } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  const user = await apiUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json()
  if (!body?.competencyId || !body?.nota) {
    return NextResponse.json({ error: 'competencyId y nota son requeridos' }, { status: 422 })
  }
  const evidence = await prisma.evidence.create({
    data: { userId: user.id, competencyId: body.competencyId, taskId: body.taskId, deliverableId: body.deliverableId, nota: body.nota },
  })
  return NextResponse.json({ evidence }, { status: 201 })
}
```

**Verificación:** `npm run build`. `git commit "feat(api): evidencia de competencias — captura sin fricción (Tarea 5)"`

---

### Tarea 6: Inbox — captura y triage (TDD)

**Tests** (`tests/inbox-service.test.ts`):
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { listInbox, triageTask } from '@/app/inbox/service'

const TEST_EMAIL = 'test-inbox@vp.mx'
beforeEach(() => deleteTestUser(TEST_EMAIL))

describe('listInbox', () => {
  it('devuelve solo tasks backlog del usuario', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    await prisma.task.create({ data: { userId: user.id, titulo: 'Idea suelta', estatus: 'backlog' } })
    await prisma.task.create({ data: { userId: user.id, titulo: 'Ya planeada', estatus: 'planned' } })
    const inbox = await listInbox(user.id)
    expect(inbox).toHaveLength(1)
    expect(inbox[0].titulo).toBe('Idea suelta')
  })
})

describe('triageTask', () => {
  it('mueve una task de backlog a planned dentro de una semana', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const week = await prisma.week.create({ data: { userId: user.id, isoWeek: '2026-W28', rangoInicio: new Date(), rangoFin: new Date(), factorUsado: 1.4 } })
    const task = await prisma.task.create({ data: { userId: user.id, titulo: 'Idea', estatus: 'backlog' } })
    const result = await triageTask(task.id, user.id, { weekId: week.id, estimadoMin: 60 })
    expect(result.estatus).toBe('planned')
    expect(result.weekId).toBe(week.id)
    expect(result.estimadoMin).toBe(60)
  })
})
```

**Implementación** (`src/app/inbox/service.ts`):
```ts
import { prisma } from '@/lib/prisma'

export async function listInbox(userId: string) {
  return prisma.task.findMany({ where: { userId, estatus: 'backlog' }, orderBy: { createdAt: 'desc' } })
}

export async function createInboxTask(userId: string, titulo: string, alcance: 'sow' | 'aliado' = 'sow', dolorCliente?: string) {
  return prisma.task.create({ data: { userId, titulo, alcance, dolorCliente, estatus: 'backlog' } })
}

export async function triageTask(
  taskId: string,
  userId: string,
  data: { weekId?: string; winId?: string; projectId?: string; estimadoMin?: number }
) {
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task || task.userId !== userId) throw new Error('task no encontrada')
  return prisma.task.update({
    where: { id: taskId },
    data: { ...data, estatus: data.weekId ? 'planned' : task.estatus },
  })
}

export async function discardTask(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task || task.userId !== userId) throw new Error('task no encontrada')
  return prisma.task.update({ where: { id: taskId }, data: { estatus: 'deferred' } })
}
```

**Verificación:** RED→GREEN. `git commit "feat(inbox): listInbox + triageTask + discardTask (Tarea 6)"`

---

### Tarea 7: Inbox — UI

**Archivos:** `src/app/inbox/actions.ts`, `src/app/inbox/page.tsx`, `src/app/inbox/InboxBoard.tsx`

**Implementación** (`actions.ts`):
```ts
'use server'
import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/auth'
import { createInboxTask, triageTask, discardTask } from './service'

async function uid() { const s = await verifySession(); if (!s) throw new Error('no autenticado'); return s.userId }

export async function captureAction(titulo: string) {
  await createInboxTask(await uid(), titulo)
  revalidatePath('/inbox')
}
export async function discardAction(taskId: string) {
  await discardTask(taskId, await uid())
  revalidatePath('/inbox')
}
```

`page.tsx` — Server Component lista `listInbox(session.userId)`, renderiza `<InboxBoard tasks={tasks} />`.

`InboxBoard.tsx` — Client Component: input de texto + botón "Agregar" (captureAction, contrato ≤10s: un input, un submit, sin campos obligatorios extra), lista de tasks con botón "Descartar". El triage completo (asignar a semana/win) se pospone a abrir la tarea desde `/semana` — mantiene el inbox rápido.

**Verificación:** `npm run build`, verificación en navegador: capturar 3 ideas, descartar 1, confirmar que desaparece. `git commit "feat(inbox): UI captura + descarte, contrato ≤10s (Tarea 7)"`

---

### Tarea 8: Mi Semana — vista

**Archivos:** `src/app/semana/service.ts`, `src/app/semana/page.tsx`

**Implementación** (`service.ts`):
```ts
import { getWeek } from '@/app/api/v1/weeks/service'
import { capacityForWeek } from '@/app/api/v1/capacity/service'

export async function getWeekView(userId: string, isoWeek: string) {
  const [week, capacidad] = await Promise.all([getWeek(userId, isoWeek), capacityForWeek(userId, isoWeek)])
  if (!week) return null
  const cargaMin = week.tasks.reduce((s, t) => s + (t.ajustadoMin ?? t.estimadoMin ?? 0), 0)
  return { week, capacidad, cargaHoras: cargaMin / 60 }
}
```

`page.tsx` — Server Component (usa `isoWeekOf(new Date())` si no viene query param), muestra: Wins con DoD y estatus, barra trabajable/carga/colchón, tabla de bloques agrupados por `fecha`. Solo lectura en v1 (la edición ocurre vía skill+API); un botón "Marcar Win logrado" con Server Action simple.

**Verificación:** build + verificación en navegador con la semana activa 2026-W28. `git commit "feat(semana): vista Mi Semana — wins, capacidad, bloques (Tarea 8)"`

---

### Tarea 9: Settings

**Archivos:** `src/app/settings/actions.ts`, `src/app/settings/page.tsx`

**Implementación:** Server Action `updateSettings(formData)` actualiza `horarioInicio/Fin, comidaInicio/Fin, bufferPct, icsUrl, factorManual`; form simple con los valores actuales precargados desde `verifySession()` + `prisma.user.findUnique`.

**Verificación:** guardar cambios, recargar, confirmar que persisten. `git commit "feat(settings): editar horario, comida, buffer, ICS, factor (Tarea 9)"`

---

### Tarea 10: Migrar skills a la API

**Archivos:** los 3 SKILL.md + retirar wtw-portal

**Cambios por skill** (reemplazan las rutas de Obsidian/Python por llamadas HTTP con el PAT de `~/.wtw-token`):

- **wtw-comprometer**: paso 3 (capacidad) → `curl -s -H "Authorization: Bearer $(cat ~/.wtw-token)" http://localhost:3000/api/v1/capacity/<isoWeek>`; paso 4 (carga comprometida) → `GET /api/v1/weeks/<isoWeek>` y sumar `estimadoMin` de tasks no-done.
- **wtw-dia**: modo mañana ya no escribe nota Obsidian — lee `GET /api/v1/weeks/<isoWeek>` para bloques de hoy; la vista viva es la app (`/dia`), no una nota. Modo cierre → `PATCH` implícito vía marcar tasks done en la app o Server Action.
- **wtw-semana**: al terminar el ritual, en vez de escribir `Semanas/AAAA-Wnn.md` + esperar `/wtw-portal`, hace `POST /api/v1/weeks` con el payload completo (wins, tasks, blocks) — un solo paso, sin regenerar nada. La nota Obsidian se sigue escribiendo en paralelo como bitácora humana (no se pierde el hábito de lectura), pero ya no es la fuente de verdad.
- **wtw-portal**: `rm -rf ~/.claude/skills/wtw-portal` — su función completa (Obsidian → week-data.js) ya no aplica.

Actualizar `CLAUDE.md` (tabla de skills instalados) quitando `wtw-portal` de la lista si aparece.

**Verificación:**
- [ ] Correr manualmente `/wtw-comprometer` con una petición de prueba y confirmar que consulta la API real (revisar logs del server)
- [ ] `ls ~/.claude/skills/ | grep wtw-portal` no devuelve nada
- [ ] git commit en el repo de skills (`~/.claude` no es este repo — commit ahí si tiene git, si no, los cambios quedan en disco) + commit en wtw-app: `git commit -m "docs: skills migrados a la API — wtw-portal retirado (Tarea 10)"`

---

## Orden de dependencias

1, 2 independientes. 3 depende de nada nuevo. 4 depende de 1+3. 5 independiente. 6 independiente. 7 depende de 6. 8 depende de 3 (capacityForWeek) y del `getWeek` de Fase 1. 9 independiente. 10 depende de 4+5+8 (las rutas que los skills van a llamar deben existir).

## Fuera de esta fase

Cron real en Vercel para sync automático de calendario (Fase 4+, requiere deploy), UI de creación de semana completa (se sigue haciendo vía skill+API), edición de bloques desde la UI (Fase 4), expansión RRULE de eventos recurrentes.
