# Plan Fase 6 — Equipo (WTW App v2)

**Diseño fuente:** `docs/plans/2026-07-06-wtw-app-design.md` (§6, §7) · **Fecha:** 2026-07-07
**Última fase del roadmap de 6.**

## Alcance y recortes conscientes (honestos, no silenciosos)

Fase 6 es la más grande del roadmap si se construye con el mismo rigor de equipo/permisos que un SaaS multi-tenant maduro. Se recorta deliberadamente a un **v1 real y funcional** para 1 manager + N reports directos (el caso real: Mau + compañeros de VP), no un sistema de roles/organizaciones genérico:

- **Sin invitación por email**: no hay infraestructura de envío de correo. Onboarding = Mau crea la cuenta del compañero (Server Action), le comparte la contraseña temporal fuera de banda (WhatsApp/Slack). Cambio de contraseña propio **se difiere** (no existe hoy ni para el usuario actual — mismo hueco, se resuelve junto).
- **Sin roles granulares**: un solo concepto — `managerId` (auto-relación en `User`). Quien tiene reports los ve; quien no, no ve a nadie. Sin "admin", "viewer", etc.
- **Feed de actividad**: en vez de un modelo `Event` nuevo con instrumentación en cada mutación existente (decenas de call sites), se deriva de timestamps ya existentes (`Task.updatedAt` en done, `Deliverable.avancePct` cambiado) — real, sin plomería nueva masiva.
- **Ritual guiado UI**: un formulario de una sola página (Wins + vaciado con estimados), no el wizard conversacional completo de 5 pasos con pre-empt — el pre-empt se beneficia más de juicio conversacional (con Claude) que de un formulario; se documenta como diferido.
- **Digest semanal automático**: requiere cron + envío (email/WhatsApp) — infra que no existe. **Se difiere.**

## Mapa de archivos

```
prisma/schema.prisma                    # + User.managerId (self-relation)
src/app/equipo/service.ts               # cockpit — reports con utilización/wins/proyectos (TDD)
src/app/equipo/actions.ts               # inviteColleagueAction
src/app/equipo/page.tsx + EquipoBoard.tsx
src/app/equipo/[reportId]/service.ts    # detalle: evidencia (con frontera de privacidad) + gaps (TDD)
src/app/equipo/[reportId]/page.tsx
src/app/roi/service.ts                  # ROI de relación — proyectos agrupados por origen (TDD)
src/app/roi/page.tsx
src/app/semana/nueva/actions.ts         # ritual guiado — un solo submit crea la semana
src/app/semana/nueva/page.tsx + NuevaSemanaForm.tsx
tests/equipo-service.test.ts, equipo-detalle.test.ts, roi.test.ts
```

---

### Tarea 1: Schema — jerarquía manager/reports

**Implementación:** agregar a `model User` en `prisma/schema.prisma`:
```prisma
managerId String?
manager   User?   @relation("management", fields: [managerId], references: [id])
reports   User[]  @relation("management")
```
Aplicar con `npx prisma db push --accept-data-loss` (mismo patrón de Fase 5 — entorno sin TTY rechaza `migrate dev`; campo nuevo nullable, sin riesgo real) + `npx prisma generate`.

**Verificación:** build limpio. `git commit "feat(db): User.managerId — jerarquía manager/reports (Tarea 1)"`

---

### Tarea 2: Onboarding de compañero (TDD)

**Tests** (`tests/equipo-service.test.ts`, primera sección):
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { inviteColleague, listReports } from '@/app/equipo/service'

const MANAGER_EMAIL = 'test-manager@vp.mx'
const REPORT_EMAIL = 'test-report@vp.mx'

beforeEach(async () => {
  await deleteTestUser(REPORT_EMAIL)
  await deleteTestUser(MANAGER_EMAIL)
})

describe('inviteColleague', () => {
  it('crea un usuario con managerId apuntando al invitador y devuelve password temporal', async () => {
    const manager = await prisma.user.create({ data: { email: MANAGER_EMAIL, nombre: 'Manager', passwordHash: 'x' } })
    const { user, tempPassword } = await inviteColleague(manager.id, REPORT_EMAIL, 'Compañero Nuevo')
    expect(user.managerId).toBe(manager.id)
    expect(tempPassword).toHaveLength(12)
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(stored.passwordHash).not.toBe(tempPassword) // debe estar hasheado
  })

  it('rechaza si el email ya existe', async () => {
    const manager = await prisma.user.create({ data: { email: MANAGER_EMAIL, nombre: 'Manager', passwordHash: 'x' } })
    await prisma.user.create({ data: { email: REPORT_EMAIL, nombre: 'Ya existe', passwordHash: 'x' } })
    await expect(inviteColleague(manager.id, REPORT_EMAIL, 'X')).rejects.toThrow()
  })
})
```

**Implementación** (`src/app/equipo/service.ts`, primera parte):
```ts
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'

function tempPassword(): string {
  return randomBytes(9).toString('base64url').slice(0, 12)
}

export async function inviteColleague(managerId: string, email: string, nombre: string) {
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) throw new Error('ese correo ya tiene cuenta')

  const password = tempPassword()
  const user = await prisma.user.create({
    data: { email, nombre, passwordHash: await bcrypt.hash(password, 10), managerId },
  })
  return { user, tempPassword: password }
}
```

`src/app/equipo/actions.ts`:
```ts
'use server'
import { verifySession } from '@/lib/auth'
import { inviteColleague } from './service'

export async function inviteColleagueAction(email: string, nombre: string): Promise<string> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')
  const { tempPassword } = await inviteColleague(session.userId, email, nombre)
  return tempPassword // se muestra una sola vez, mismo patrón que PAT/portal token
}
```

**Verificación:** RED→GREEN. `git commit "feat(equipo): onboarding de compañero — managerId + password temporal (Tarea 2)"`

---

### Tarea 3: Cockpit de equipo (TDD)

**Tests** (agregar a `tests/equipo-service.test.ts`):
```ts
import { listReports } from '@/app/equipo/service'

describe('listReports', () => {
  it('lista reports directos con utilización, wins de la semana activa y proyectos activos', async () => {
    const manager = await prisma.user.create({ data: { email: MANAGER_EMAIL, nombre: 'Manager', passwordHash: 'x' } })
    const report = await prisma.user.create({ data: { email: REPORT_EMAIL, nombre: 'Reporte', passwordHash: 'x', managerId: manager.id } })
    const proj = await prisma.project.create({ data: { userId: report.id, nombre: 'X', estatus: 'activo' } })
    const week = await prisma.week.create({ data: { userId: report.id, isoWeek: '2026-W28', rangoInicio: new Date(), rangoFin: new Date(), factorUsado: 1.4, estatus: 'active' } })
    await prisma.win.create({ data: { weekId: week.id, posicion: 1, titulo: 'Win reporte', estatus: 'pendiente' } })
    const task = await prisma.task.create({ data: { userId: report.id, projectId: proj.id, titulo: 'y' } })
    await prisma.timeEntry.create({ data: { userId: report.id, taskId: task.id, startedAt: new Date(), stoppedAt: new Date(), seconds: 3600 } })

    const reports = await listReports(manager.id)
    expect(reports).toHaveLength(1)
    expect(reports[0].nombre).toBe('Reporte')
    expect(reports[0].proyectosActivos).toBe(1)
    expect(reports[0].winsSemana).toHaveLength(1)
    expect(reports[0].utilizacion.facturableHoras + reports[0].utilizacion.internoHoras).toBeGreaterThan(0)
  })

  it('devuelve [] si no tiene reports', async () => {
    const manager = await prisma.user.create({ data: { email: MANAGER_EMAIL, nombre: 'Manager', passwordHash: 'x' } })
    expect(await listReports(manager.id)).toEqual([])
  })
})
```

**Implementación** — agregar a `src/app/equipo/service.ts`:
```ts
import { computeUtilizacion } from '@/app/api/v1/utilizacion/service'
import { isoWeekOf } from '@/lib/dates'

export async function listReports(managerId: string) {
  const reports = await prisma.user.findMany({ where: { managerId } })

  return Promise.all(
    reports.map(async (r) => {
      const [proyectosActivos, semanaActiva, utilizacion] = await Promise.all([
        prisma.project.count({ where: { userId: r.id, estatus: 'activo' } }),
        prisma.week.findUnique({
          where: { userId_isoWeek: { userId: r.id, isoWeek: isoWeekOf(new Date()) } },
          include: { wins: true },
        }),
        computeUtilizacion(r.id),
      ])
      return {
        id: r.id,
        nombre: r.nombre,
        email: r.email,
        proyectosActivos,
        winsSemana: semanaActiva?.wins ?? [],
        utilizacion,
      }
    })
  )
}
```

**Verificación:** RED→GREEN. `git commit "feat(equipo): cockpit — reports con utilización, wins, proyectos (Tarea 3)"`

---

### Tarea 4: UI del cockpit + onboarding

**Archivos:** `src/app/equipo/page.tsx`, `src/app/equipo/EquipoBoard.tsx`

**Implementación:** `page.tsx` (Server Component) llama `listReports(session.userId)`; `EquipoBoard.tsx` (Client Component) muestra:
- Formulario simple (email + nombre) → `inviteColleagueAction` → muestra la password temporal en un alert/banner (una sola vez, mismo patrón que PAT)
- Una tarjeta por report: nombre, proyectos activos, Wins de la semana (con estatus), barra de utilización — link a `/equipo/[reportId]` para el detalle de desarrollo

**Verificación:** build + browser (crear un compañero real de prueba, confirmar que aparece en el cockpit). `git commit "feat(equipo): UI cockpit + onboarding (Tarea 4)"`

---

### Tarea 5: Detalle de report — 360 con frontera de privacidad (TDD)

**Objetivo:** Un manager ve la cobertura de competencias de SU report — nunca de alguien que no es su report directo.

**Tests** (`tests/equipo-detalle.test.ts`):
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { getCoberturaParaManager } from '@/app/equipo/[reportId]/service'

const MANAGER_EMAIL = 'test-mgr-det@vp.mx'
const REPORT_EMAIL = 'test-rep-det@vp.mx'
const OTRO_EMAIL = 'test-otro-det@vp.mx'

beforeEach(async () => {
  await deleteTestUser(REPORT_EMAIL)
  await deleteTestUser(OTRO_EMAIL)
  await deleteTestUser(MANAGER_EMAIL)
})

describe('getCoberturaParaManager', () => {
  it('devuelve la cobertura si el report es directo del manager', async () => {
    const manager = await prisma.user.create({ data: { email: MANAGER_EMAIL, nombre: 'M', passwordHash: 'x' } })
    const report = await prisma.user.create({ data: { email: REPORT_EMAIL, nombre: 'R', passwordHash: 'x', managerId: manager.id } })
    const cobertura = await getCoberturaParaManager(manager.id, report.id)
    expect(cobertura).not.toBeNull()
  })

  it('devuelve null si el usuario objetivo NO es su report — frontera de privacidad', async () => {
    const manager = await prisma.user.create({ data: { email: MANAGER_EMAIL, nombre: 'M', passwordHash: 'x' } })
    const otro = await prisma.user.create({ data: { email: OTRO_EMAIL, nombre: 'Otro', passwordHash: 'x' } }) // sin managerId
    expect(await getCoberturaParaManager(manager.id, otro.id)).toBeNull()
  })
})
```

**Implementación** (`src/app/equipo/[reportId]/service.ts`):
```ts
import { prisma } from '@/lib/prisma'
import { getCoberturaCompetencias } from '@/app/desarrollo/service'

export async function getCoberturaParaManager(managerId: string, reportId: string) {
  const report = await prisma.user.findUnique({ where: { id: reportId } })
  if (!report || report.managerId !== managerId) return null // frontera de privacidad — dueño + su gerente, no pares

  const cobertura = await getCoberturaCompetencias(reportId)
  const gaps = cobertura.filter((c) => c.evidenciaCount === 0).slice(0, 5)
  return { report: { nombre: report.nombre }, cobertura, gapsTop5: gaps }
}
```

`page.tsx` — igual estructura que `/desarrollo` pero desde la perspectiva del manager, con sección destacada "Huecos para staffing" (los `gapsTop5`) — útil al asignar al report a un frente nuevo.

**Verificación:** RED→GREEN + build + browser. `git commit "feat(equipo): detalle report — 360 con frontera de privacidad + gaps de staffing (Tarea 5)"`

---

### Tarea 6: ROI de relación (TDD)

**Tests** (`tests/roi.test.ts`):
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { getROIRelacion } from '@/app/roi/service'

const TEST_EMAIL = 'test-roi@vp.mx'
beforeEach(() => deleteTestUser(TEST_EMAIL))

describe('getROIRelacion', () => {
  it('agrupa proyectos por origen y cuenta recompras', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    await prisma.project.create({ data: { userId: user.id, nombre: 'Liverpool KPIs', origen: 'Liverpool' } })
    await prisma.project.create({ data: { userId: user.id, nombre: 'Liverpool Gemelo', origen: 'Liverpool' } })
    await prisma.project.create({ data: { userId: user.id, nombre: 'Liverpool' } }) // sin origen — es el proyecto raíz

    const roi = await getROIRelacion(user.id)
    const liverpool = roi.find((r) => r.origen === 'Liverpool')!
    expect(liverpool.recompras).toBe(2)
  })

  it('devuelve [] si ningún proyecto tiene origen', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    await prisma.project.create({ data: { userId: user.id, nombre: 'X' } })
    expect(await getROIRelacion(user.id)).toEqual([])
  })
})
```

**Implementación** (`src/app/roi/service.ts`):
```ts
import { prisma } from '@/lib/prisma'

export async function getROIRelacion(userId: string) {
  const proyectos = await prisma.project.findMany({ where: { userId, origen: { not: null } } })
  const porOrigen = new Map<string, string[]>()
  for (const p of proyectos) {
    const key = p.origen!
    ;(porOrigen.get(key) ?? porOrigen.set(key, []).get(key)!).push(p.nombre)
  }
  return Array.from(porOrigen.entries()).map(([origen, nombres]) => ({ origen, recompras: nombres.length, proyectos: nombres }))
}
```

`page.tsx` — lista simple: "Liverpool → 2 proyectos adicionales (Liverpool KPIs, Liverpool Gemelo)" — evidencia de que la inversión aliado/relación genera recompra orgánica.

**Verificación:** RED→GREEN + build + browser. `git commit "feat(roi): ROI de relación — recompras por origen (Tarea 6)"`

---

### Tarea 7: Ritual guiado en UI (simplificado)

**Objetivo:** Un compañero sin Claude Code puede armar su semana — formulario de una página, no wizard de 5 pasos.

**Archivos:** `src/app/semana/nueva/actions.ts`, `src/app/semana/nueva/page.tsx`, `src/app/semana/nueva/NuevaSemanaForm.tsx`

**Implementación** (`actions.ts`):
```ts
'use server'
import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import { createWeekPayload, type CreateWeekPayload } from '@/app/api/v1/weeks/service'
import { isoWeekOf } from '@/lib/dates'

export async function crearSemanaAction(payload: Omit<CreateWeekPayload, 'isoWeek'>) {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')
  await createWeekPayload(session.userId, { ...payload, isoWeek: isoWeekOf(new Date()) })
  redirect('/semana')
}
```

`NuevaSemanaForm.tsx` — Client Component: hasta 3 campos de Win (título + DoD), lista dinámica de tareas (título, proyecto, estimado en horas, DoD como textarea de líneas), factor de realismo precargado desde Settings. Al enviar, arma el payload y llama `crearSemanaAction`. **Sin pre-empt ni capacidad en vivo** — el vaciado y wins sí, el resto (bloquear en calendario, pre-empt) queda para cuando el compañero tenga más contexto o pida ayuda a Mau/Claude directamente.

**Verificación:** build + browser — llenar el formulario con 1 Win + 1 tarea, confirmar que crea la semana y aparece en `/semana`. `git commit "feat(semana): ritual guiado en UI — formulario de una página (Tarea 7)"`

---

### Tarea 8: Verificación integral de Fase 6 y cierre del roadmap

1. `npx vitest run` completo (todas las fases), `npm run build`.
2. Navegador: `/equipo` → crear compañero de prueba real → confirmar cockpit lo muestra con 0 proyectos/wins (limpio) → `/equipo/[id]` confirmar 360 + gaps → `/roi` confirmar vacío sin tronar → `/semana/nueva` crear una semana de prueba real para el compañero (login como él) y confirmar que aparece en su `/semana`.
3. Limpiar el usuario de prueba creado (o dejarlo como demo — decisión de Mau, no automática).
4. Actualizar `~/.claude/CLAUDE.md` de wtw-app si aplica, memoria del proyecto marcando las 6 fases completas.

**Verificación:** todo verde, commit final, resumen de cierre del roadmap completo al usuario.

---

## Orden de dependencias

1 → 2 → 3 → 4. 5 depende de 1 (managerId) + Fase 4 (getCoberturaCompetencias). 6 independiente. 7 depende de Fase 1 (createWeekPayload). 8 depende de todas.

## Fuera de todo el roadmap v1 (explícitamente diferido, no olvidado)

Invitación por email, cambio de contraseña propio, roles granulares más allá de manager/report, modelo `Event` de auditoría completo, digest automático (cron + envío), notificaciones push PWA, generación automática de PPTX de status, expansión RRULE de calendario, importación de histórico pre-app.
