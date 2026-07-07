# Plan Fase 5 — Cliente + Economía (WTW App v2)

**Diseño fuente:** `docs/plans/2026-07-06-wtw-app-design.md` (§5, §6, §7) · **Fecha:** 2026-07-07

## Alcance y recortes conscientes

- **PPTX generado automáticamente**: el diseño menciona "el PPTX de status se genera desde estos mismos datos" — se **difiere**. El portal HTML cliente (Tarea 3) ya resuelve el 90% del valor (status siempre actualizado, sin armar nada a mano); generar PPTX es una capa de exportación adicional que se agrega si se siente la falta, no bloquea el valor central.
- **Envío de status por email/WhatsApp**: fuera de alcance — el portal es la fuente, compartir el link es manual por ahora.

## Mapa de archivos

```
src/lib/tokens.ts                          # generar/hashear portal tokens (TDD)
src/app/portal/[token]/service.ts          # datos del portal cliente — filtra campos sensibles (TDD)
src/app/portal/[token]/page.tsx            # vista pública, sin login
src/app/proyectos/[id]/portal-actions.ts   # generar/revocar el magic-link
src/app/aliado/service.ts                  # ledger de valor adicional (TDD)
src/app/aliado/page.tsx
prisma/schema.prisma                       # + Project.portalTokenHash
tests/tokens.test.ts, portal-service.test.ts, aliado-service.test.ts
```

## Cambio de schema

Agregar a `Project`: `portalTokenHash String? @unique` — hash del token del magic-link (nunca se guarda el token en claro, mismo patrón que `apiTokenHash` de Fase 1).

---

### Tarea 1: Migración de schema — portalTokenHash

**Implementación:** agregar el campo a `prisma/schema.prisma`, correr `npx prisma migrate dev --name portal_token`.

**Verificación:** migración aplica sin error, `npx prisma generate` sin error. `git commit "feat(db): Project.portalTokenHash — magic-link del portal cliente (Tarea 1)"`

---

### Tarea 2: Generar/revocar token del portal (TDD)

**Tests** (`tests/tokens.test.ts`):
```ts
import { describe, it, expect } from 'vitest'
import { hashPortalToken, newPortalToken } from '@/lib/tokens'

describe('tokens del portal', () => {
  it('newPortalToken genera tokens únicos con prefijo distinguible', () => {
    const a = newPortalToken()
    const b = newPortalToken()
    expect(a).toMatch(/^wtwp_[A-Za-z0-9_-]{20,}$/)
    expect(a).not.toBe(b)
  })
  it('hashPortalToken es determinista', () => {
    expect(hashPortalToken('x')).toBe(hashPortalToken('x'))
    expect(hashPortalToken('x')).not.toBe(hashPortalToken('y'))
  })
})
```

**Implementación** (`src/lib/tokens.ts`):
```ts
import { createHash, randomBytes } from 'crypto'

export function newPortalToken(): string {
  return 'wtwp_' + randomBytes(24).toString('base64url')
}

export function hashPortalToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
```

`src/app/proyectos/[id]/portal-actions.ts`:
```ts
'use server'
import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { newPortalToken, hashPortalToken } from '@/lib/tokens'

export async function generatePortalLinkAction(projectId: string): Promise<string> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project || project.userId !== session.userId) throw new Error('proyecto no encontrado')

  const token = newPortalToken()
  await prisma.project.update({ where: { id: projectId }, data: { portalTokenHash: hashPortalToken(token) } })
  revalidatePath(`/proyectos/${projectId}`)
  return token // se muestra una sola vez, como el PAT
}

export async function revokePortalLinkAction(projectId: string) {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project || project.userId !== session.userId) throw new Error('proyecto no encontrado')
  await prisma.project.update({ where: { id: projectId }, data: { portalTokenHash: null } })
  revalidatePath(`/proyectos/${projectId}`)
}
```

**Verificación:** RED→GREEN. `git commit "feat(portal): generar/revocar magic-link por proyecto (Tarea 2)"`

---

### Tarea 3: Datos del portal cliente — frontera de visibilidad dura (TDD)

**Objetivo:** El cliente ve avance/entregables/semáforos/pendientes-que-le-tocan. **Nunca** horas internas, ledger aliado, economía, ni asignaciones.

**Tests** (`tests/portal-service.test.ts`):
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { hashPortalToken } from '@/lib/tokens'
import { getPortalData } from '@/app/portal/[token]/service'

const TEST_EMAIL = 'test-portal@vp.mx'
beforeEach(() => deleteTestUser(TEST_EMAIL))

describe('getPortalData', () => {
  it('devuelve entregables, semáforos e issues con responsable=cliente, sin datos internos', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const proj = await prisma.project.create({ data: { userId: user.id, nombre: 'Liverpool', portalTokenHash: hashPortalToken('tok123') } })
    await prisma.deliverable.create({ data: { projectId: proj.id, nombre: 'KPIs', avancePct: 60, fechaComprometida: new Date('2026-08-01') } })
    await prisma.issue.create({ data: { projectId: proj.id, tipo: 'pendiente', descripcion: 'Falta info CDRs', responsable: 'Cliente', estatus: 'abierto' } })

    const data = await getPortalData('tok123')
    expect(data).not.toBeNull()
    expect(data!.proyecto.nombre).toBe('Liverpool')
    expect(data!.entregables[0].avancePct).toBe(60)
    expect(data!.apoyoRequerido).toHaveLength(1)
    // frontera dura: no debe existir ninguna clave de horas/dinero en el shape devuelto
    expect(JSON.stringify(data)).not.toMatch(/hora|presupuesto|tarifa|aliado|allocation/i)
  })

  it('devuelve null con un token inválido', async () => {
    expect(await getPortalData('token-que-no-existe')).toBeNull()
  })
})
```

**Implementación** (`src/app/portal/[token]/service.ts`):
```ts
import { prisma } from '@/lib/prisma'
import { hashPortalToken } from '@/lib/tokens'

export async function getPortalData(token: string) {
  const project = await prisma.project.findUnique({
    where: { portalTokenHash: hashPortalToken(token) },
    include: {
      deliverables: { orderBy: { createdAt: 'asc' } },
      issues: { where: { estatus: 'abierto' } },
    },
  })
  if (!project) return null

  return {
    proyecto: { nombre: project.nombre, cliente: project.cliente },
    entregables: project.deliverables.map((d) => ({
      nombre: d.nombre,
      avancePct: d.avancePct,
      fechaComprometida: d.fechaComprometida,
      estatus: d.estatus,
    })),
    apoyoRequerido: project.issues
      .filter((i) => i.responsable?.toLowerCase().includes('cliente'))
      .map((i) => ({ descripcion: i.descripcion, fechaCompromiso: i.fechaCompromiso })),
  }
}
```

**Verificación:** RED→GREEN — el assert de regex sobre el JSON serializado es la prueba activa de la frontera de visibilidad; si algún campo interno se cuela, este test lo atrapa. `git commit "feat(portal): datos cliente con frontera de visibilidad dura (Tarea 3)"`

---

### Tarea 4: Página del portal (pública, sin login)

**Archivos:** `src/app/portal/[token]/page.tsx`, editar `src/proxy.ts` (excluir `/portal/` del matcher — es la única vista que debe ser accesible SIN sesión propia, autenticada solo por el token en la URL)

**Implementación** — `page.tsx`:
```tsx
import { getPortalData } from './service'
import { notFound } from 'next/navigation'

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const data = await getPortalData(token)
  if (!data) notFound()

  return (
    <main className="min-h-dvh bg-neutral-50 p-4">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-lg font-bold text-neutral-900">{data.proyecto.nombre}</h1>
          <p className="text-sm text-neutral-500">Estatus del proyecto</p>
        </div>
        <section className="space-y-2">
          {data.entregables.map((e) => (
            <div key={e.nombre} className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
              <div className="flex justify-between">
                <span className="font-medium text-neutral-900">{e.nombre}</span>
                <span className="text-sm text-neutral-500">{e.avancePct}%</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                <div className="h-full bg-[#0A7C82]" style={{ width: `${e.avancePct}%` }} />
              </div>
            </div>
          ))}
        </section>
        {data.apoyoRequerido.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase text-neutral-500">Apoyo requerido</h2>
            {data.apoyoRequerido.map((a, i) => (
              <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {a.descripcion}
              </div>
            ))}
          </section>
        )}
      </div>
    </main>
  )
}
```

Editar matcher de `src/proxy.ts` para excluir `portal/` (igual patrón que `manifest.webmanifest|pwa/|sw.js` de Fase 2 — lección ya aprendida, aplicarla proactivamente aquí en vez de descubrirla de nuevo en verificación).

**Verificación:** build + navegador — generar un token real, abrir `/portal/<token>` en una sesión SIN cookie (usar `preview_eval` con `fetch` sin credentials, o verificar con `curl` sin cookie) y confirmar 200 con los datos correctos. `git commit "feat(portal): página pública del cliente — sin login (Tarea 4)"`

---

### Tarea 5: Ledger Aliado (TDD)

**Objetivo:** Acumulado de valor adicional por proyecto — horas, dolores atendidos, valorizado a tarifa.

**Tests** (`tests/aliado-service.test.ts`):
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { getLedgerAliado } from '@/app/aliado/service'

const TEST_EMAIL = 'test-aliado@vp.mx'
beforeEach(() => deleteTestUser(TEST_EMAIL))

describe('getLedgerAliado', () => {
  it('acumula horas aliado por proyecto con sus dolores y valoriza a tarifa', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const proj = await prisma.project.create({ data: { userId: user.id, nombre: 'Liverpool', tarifaHora: 2000 } })
    const t1 = await prisma.task.create({ data: { userId: user.id, projectId: proj.id, titulo: 'x', alcance: 'aliado', dolorCliente: 'Falta de visibilidad de datos' } })
    await prisma.timeEntry.create({ data: { userId: user.id, taskId: t1.id, startedAt: new Date(), stoppedAt: new Date(), seconds: 3600 } })

    const ledger = await getLedgerAliado(user.id)
    const liverpool = ledger.find((l) => l.projectNombre === 'Liverpool')!
    expect(liverpool.horasAliado).toBeCloseTo(1, 2)
    expect(liverpool.valorizado).toBe(2000)
    expect(liverpool.dolores).toContain('Falta de visibilidad de datos')
  })

  it('proyecto sin tarifaHora no valoriza (null, no truena)', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const proj = await prisma.project.create({ data: { userId: user.id, nombre: 'SinTarifa' } })
    const t1 = await prisma.task.create({ data: { userId: user.id, projectId: proj.id, titulo: 'x', alcance: 'aliado' } })
    await prisma.timeEntry.create({ data: { userId: user.id, taskId: t1.id, startedAt: new Date(), stoppedAt: new Date(), seconds: 3600 } })
    const ledger = await getLedgerAliado(user.id)
    expect(ledger.find((l) => l.projectNombre === 'SinTarifa')!.valorizado).toBeNull()
  })
})
```

**Implementación** (`src/app/aliado/service.ts`):
```ts
import { prisma } from '@/lib/prisma'

export async function getLedgerAliado(userId: string) {
  const tasks = await prisma.task.findMany({
    where: { userId, alcance: 'aliado', projectId: { not: null } },
    include: { project: true, timeEntries: { where: { stoppedAt: { not: null } } } },
  })

  const porProyecto = new Map<string, { projectNombre: string; segundos: number; tarifaHora: number | null; dolores: Set<string> }>()

  for (const t of tasks) {
    const key = t.projectId!
    const acc = porProyecto.get(key) ?? {
      projectNombre: t.project!.nombre,
      segundos: 0,
      tarifaHora: t.project!.tarifaHora ? Number(t.project!.tarifaHora) : null,
      dolores: new Set<string>(),
    }
    acc.segundos += t.timeEntries.reduce((s, e) => s + e.seconds, 0)
    if (t.dolorCliente) acc.dolores.add(t.dolorCliente)
    porProyecto.set(key, acc)
  }

  return Array.from(porProyecto.values()).map((p) => ({
    projectNombre: p.projectNombre,
    horasAliado: p.segundos / 3600,
    valorizado: p.tarifaHora ? Math.round((p.segundos / 3600) * p.tarifaHora) : null,
    dolores: Array.from(p.dolores),
  }))
}
```

`page.tsx` — tabla por proyecto: horas aliado, valorizado (o "—" si no hay tarifa), lista de dolores atendidos. Encabezado explicando el concepto en una línea ("Trabajo fuera del plan que te posiciona como aliado estratégico — no es fuga, es inversión medible").

**Verificación:** RED→GREEN + build + browser. `git commit "feat(aliado): ledger de valor adicional por proyecto (Tarea 5)"`

---

### Tarea 6: Verificación integral

1. `npx vitest run`, `npm run build`.
2. Generar un portal link real para Liverpool desde una Server Action ejecutada vía script/consola, abrir `/portal/<token>` y confirmar que carga sin sesión.
3. Confirmar que `/proyectos/[id]` sigue exigiendo login (la frontera solo se abre para `/portal/*`).
4. `/aliado` — confirmar que no truena con 0 tasks aliado (array vacío).
5. Screenshot del portal cliente.

**Verificación:** todo verde, commit final.

---

## Orden de dependencias

1 → 2 → {3, 4}. 3 depende de 1 (necesita el campo). 4 depende de 3. 5 independiente. 6 depende de todas.

## Fuera de esta fase

Generación automática de PPTX desde los datos del portal, envío del link por email/WhatsApp, múltiples portales por proyecto (hoy es 1:1 con el proyecto, suficiente para el caso real).
