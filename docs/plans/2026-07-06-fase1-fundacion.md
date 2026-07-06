# Plan Fase 1 — Fundación (WTW App v2)

**Diseño fuente:** `docs/plans/2026-07-06-wtw-app-design.md` · **Fecha:** 2026-07-06
**Hito de la fase:** DB viva — schema 4 capas migrado, auth funcionando, API core con PAT, seed con catálogo VP + proyectos + semana en curso.

## Correcciones al diseño detectadas al mapear

- El stack real probado de RestaurantOS es **Next.js 16.2.4** (no 15), React 19.2.4, Prisma 6.19.2. Usamos ese. ⚠️ Next 16 tiene breaking changes vs. training data: **leer `node_modules/next/dist/docs/` antes de escribir código de App Router**.
- Fase 1 corre contra **PostgreSQL 17 local** (`localhost`, binario en `/usr/local/opt/postgresql@17/bin`). Neon entra en Fase 2 con el deploy (mismas env vars `DATABASE_URL`/`DIRECT_URL`).
- Sync de calendario (.ics cron) y cálculo de capacidad se mueven a Fase 3 (los necesita la migración de skills, no la fundación).

## Prerequisitos (manual, antes de la Tarea 1)

```bash
/usr/local/opt/postgresql@17/bin/createdb wtw_app_dev
```
`.env` del proyecto:
```
DATABASE_URL="postgresql://vpconsulting@localhost:5432/wtw_app_dev"
DIRECT_URL="postgresql://vpconsulting@localhost:5432/wtw_app_dev"
SESSION_SECRET="<openssl rand -base64 32>"
```

## Mapa de archivos

```
wtw-app/
├── prisma/schema.prisma            # schema 4 capas
├── prisma/seed.ts                  # seed: niveles, competencias, Mau, proyectos, semana
├── prisma/seed-data/competencias-vp.ts  # GENERADO por scripts/extract_competencias.py
├── scripts/extract_competencias.py # extrae catálogo del Excel 360
├── scripts/generate-token.ts       # genera PAT y guarda hash
├── src/lib/prisma.ts               # singleton client
├── src/lib/session.ts              # jose JWT + cookie (patrón RestaurantOS)
├── src/lib/auth.ts                 # verifySession
├── src/lib/api-auth.ts             # PAT Bearer para /api/v1
├── src/lib/dates.ts                # isoWeekOf, weekRange
├── src/middleware.ts               # redirect a /login
├── src/app/login/page.tsx + actions.ts
├── src/app/api/v1/projects/route.ts
├── src/app/api/v1/weeks/route.ts
├── src/app/api/v1/weeks/[isoWeek]/route.ts
├── src/app/api/v1/timer/route.ts
└── tests/{dates,session,api-auth,projects,weeks,timer,seed}.test.ts
```

---

### Tarea 1: Scaffold del proyecto

**Objetivo:** App Next.js 16 con TypeScript, Tailwind v4, Prisma, vitest — estructura idéntica a RestaurantOS.

**Archivos:** raíz del repo `/Users/vpconsulting/projects/wtw-app`

**Implementación:**
```bash
cd /Users/vpconsulting/projects/wtw-app
npx create-next-app@16 . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack --no-git
npm i @prisma/client@6 jose bcryptjs server-only && npm i -D prisma@6 vitest @vitejs/plugin-react jsdom @types/bcryptjs
npx prisma init
```
Copiar `vitest.config.ts` de RestaurantOS (plugins react, environment jsdom, alias `@` → `./src`). Agregar a `package.json` scripts: `"test": "vitest run"`, `"db:migrate": "prisma migrate dev"`, `"db:seed": "prisma db seed"`, `"postinstall": "prisma generate"` y bloque `"prisma": { "seed": "npx tsx prisma/seed.ts" }` (instalar `tsx` dev). Crear `.env` según prerequisitos. **Leer `node_modules/next/dist/docs/` (App Router, route handlers) antes de las tareas 6+.**

**Verificación:**
- [ ] `npm run dev` levanta sin errores
- [ ] `npx vitest run` corre (0 tests, exit 0)
- [ ] git commit "chore: scaffold Next 16 + prisma + vitest"

---

### Tarea 2: Schema Prisma — 4 capas

**Objetivo:** `prisma/schema.prisma` completo con las 4 capas del diseño.

**Archivos:** `prisma/schema.prisma`

**Implementación (archivo completo):**
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// ── Enums ──────────────────────────────────────────────
enum ProjectType {
  facturable
  interno
  desarrollo
}

enum ProjectStatus {
  activo
  pausado
  cerrado
}

enum BlockType {
  tarea
  junta
  hito
  descanso // "break" en el tablero viejo
}

enum TaskStatus {
  backlog
  planned
  in_progress
  done
  deferred
}

enum WeekStatus {
  planning
  active
  closed
}

enum WinStatus {
  pendiente
  logrado
  fallido
}

enum DeliverableStatus {
  borrador
  rev_interna
  rev_cliente
  aceptado
}

enum IssueStatus {
  abierto
  cerrado
}

enum IssueTipo {
  riesgo
  pendiente
  acuerdo
  decision
  cambio // change control light: modificaciones al plan de trabajo
}

enum CompetencyType {
  individual
  rol
}

enum Alcance {
  sow    // comprometido en el plan de trabajo
  aliado // valor adicional intencional — inversión en la alianza (diferencial VP)
}

// ── Capa 1: Ejecución personal ─────────────────────────
model User {
  id             String   @id @default(cuid())
  email          String   @unique
  nombre         String
  passwordHash   String
  apiTokenHash   String?  @unique // sha256 del PAT
  horarioInicio  String   @default("09:00")
  horarioFin     String   @default("18:00")
  comidaInicio   String   @default("14:00")
  comidaFin      String   @default("15:00")
  bufferPct      Int      @default(25)
  factorManual   Decimal? @db.Decimal(4, 2) // override; el auto se calcula de TimeEntries
  icsUrl         String?
  timezone       String   @default("America/Mexico_City")
  nivelActualId  String?
  nivelObjetivoId String?
  nivelActual    Level?   @relation("actual", fields: [nivelActualId], references: [id])
  nivelObjetivo  Level?   @relation("objetivo", fields: [nivelObjetivoId], references: [id])
  weeks          Week[]
  tasks          Task[]
  timeEntries    TimeEntry[]
  calendarEvents CalendarEvent[]
  projects       Project[]
  evidences      Evidence[]
  dayOverrides   DayOverride[]
  allocations    Allocation[]
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model Week {
  id         String     @id @default(cuid())
  userId     String
  user       User       @relation(fields: [userId], references: [id])
  isoWeek    String // "2026-W27"
  rangoInicio DateTime  @db.Date
  rangoFin   DateTime   @db.Date
  factorUsado Decimal   @db.Decimal(4, 2)
  reflexion  String?
  estatus    WeekStatus @default(planning)
  horarioOverride String?
  wins       Win[]
  tasks      Task[]
  blocks     Block[]
  createdAt  DateTime   @default(now())
  updatedAt  DateTime   @updatedAt

  @@unique([userId, isoWeek])
}

model Win {
  id       String    @id @default(cuid())
  weekId   String
  week     Week      @relation(fields: [weekId], references: [id], onDelete: Cascade)
  posicion Int // 1-3
  titulo   String
  dod      String?
  estatus  WinStatus @default(pendiente)
  tasks    Task[]

  @@unique([weekId, posicion])
}

model Task {
  id            String     @id @default(cuid())
  userId        String
  user          User       @relation(fields: [userId], references: [id])
  projectId     String?
  project       Project?   @relation(fields: [projectId], references: [id])
  deliverableId String?
  deliverable   Deliverable? @relation(fields: [deliverableId], references: [id])
  winId         String?
  win           Win?       @relation(fields: [winId], references: [id])
  weekId        String?
  week          Week?      @relation(fields: [weekId], references: [id])
  titulo        String
  estimadoMin   Int?
  ajustadoMin   Int?
  deadline      DateTime?  @db.Date
  estatus       TaskStatus @default(backlog)
  alcance       Alcance    @default(sow)
  dolorCliente  String? // qué dolor del cliente atiende (requerido en UI/skill si alcance=aliado)
  dodItems      DodItem[]
  blocks        Block[]
  timeEntries   TimeEntry[]
  evidences     Evidence[]
  competencias  Competency[] @relation("TaskCompetencias") // etiquetado al planear
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt
}

model DodItem {
  id     String  @id @default(cuid())
  taskId String
  task   Task    @relation(fields: [taskId], references: [id], onDelete: Cascade)
  texto  String
  done   Boolean @default(false)
  orden  Int     @default(0)
}

model Block {
  id      String    @id @default(cuid())
  weekId  String
  week    Week      @relation(fields: [weekId], references: [id], onDelete: Cascade)
  taskId  String?
  task    Task?     @relation(fields: [taskId], references: [id])
  fecha   DateTime  @db.Date
  inicio  String // "09:00" | "flex"
  fin     String
  tipo    BlockType
  titulo  String // denormalizado para juntas/breaks sin task
  planMin Int
  done    Boolean   @default(false) // para junta/hito/descanso
  orden   Int       @default(0)
}

model TimeEntry {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id])
  taskId    String
  task      Task      @relation(fields: [taskId], references: [id])
  startedAt DateTime
  stoppedAt DateTime?
  seconds   Int       @default(0) // calculado al stop
  manual    Boolean   @default(false) // corregido/agregado a mano — honestidad de datos

  @@index([userId, stoppedAt])
}

model DayOverride {
  id     String   @id @default(cuid())
  userId String
  user   User     @relation(fields: [userId], references: [id])
  fecha  DateTime @db.Date
  inicio String? // null = día no laborable (vacaciones/festivo)
  fin    String?
  nota   String? // "vuelo a Cancún", "festivo", "jornada 9-21"

  @@unique([userId, fecha])
}

model Allocation {
  id           String    @id @default(cuid())
  userId       String
  user         User      @relation(fields: [userId], references: [id])
  projectId    String
  project      Project   @relation(fields: [projectId], references: [id])
  pct          Int // % objetivo de dedicación
  vigenteDesde DateTime  @db.Date
  vigenteHasta DateTime? @db.Date // null = vigente

  @@index([userId, vigenteDesde])
}

model CalendarEvent {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  externalId String // UID del ICS
  fecha      DateTime @db.Date
  inicio     String
  fin        String
  titulo     String
  updatedAt  DateTime @updatedAt

  @@unique([userId, externalId])
}

// ── Capa 2: Engagement ─────────────────────────────────
model Project {
  id              String        @id @default(cuid())
  userId          String // owner (v1); fase equipo agrega members
  user            User          @relation(fields: [userId], references: [id])
  nombre          String
  cliente         String?
  color           String        @default("#0A7C82")
  tipo            ProjectType   @default(facturable)
  estatus         ProjectStatus @default(activo)
  fechaInicio     DateTime?     @db.Date
  fechaFin        DateTime?     @db.Date
  presupuestoHoras Decimal?     @db.Decimal(7, 2)
  tarifaHora      Decimal?      @db.Decimal(12, 2)
  origen          String? // recompra derivada de qué relación/proyecto — ROI de alianza
  presupuestoAliadoHoras Decimal? @db.Decimal(7, 2) // gobernanza de inversión aliado
  allocations     Allocation[]
  deliverables    Deliverable[]
  issues          Issue[]
  tasks           Task[]
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  @@unique([userId, nombre])
}

model Deliverable {
  id               String            @id @default(cuid())
  projectId        String
  project          Project           @relation(fields: [projectId], references: [id], onDelete: Cascade)
  numeroSow        String?
  nombre           String
  hipotesis        String? // answer-first: respuesta esperada
  fechaInicio      DateTime?         @db.Date // para la curva de avance proyectado
  fechaComprometida DateTime?        @db.Date // baseline SOW — inmutable
  fechaProyectada  DateTime?         @db.Date // forecast vivo
  avancePct        Int               @default(0) // declarado, no derivado (práctica PMO)
  presupuestoHoras Decimal?          @db.Decimal(7, 2)
  estatus          DeliverableStatus @default(borrador)
  alcance          Alcance           @default(sow)
  cartaUrl         String?
  tasks            Task[]
  evidences        Evidence[]
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
}

model Issue {
  id              String      @id @default(cuid())
  projectId       String
  project         Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  tipo            IssueTipo   @default(pendiente) // RAID completo en una tabla
  tema            String?
  descripcion     String
  responsable     String? // interno o del cliente ("Apoyo Requerido" del status)
  fechaCompromiso DateTime?   @db.Date
  estatus         IssueStatus @default(abierto)
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
}

// ── Capa 4: Desarrollo profesional ─────────────────────
model Level {
  id           String @id @default(cuid())
  nombre       String @unique // Analista, Consultor Sr, Gerente, Gerente Sr
  orden        Int    @unique
  expectativas String?
  usersActual   User[] @relation("actual")
  usersObjetivo User[] @relation("objetivo")
}

model Competency {
  id       String         @id @default(cuid())
  tipo     CompetencyType
  grupo    String? // nombre del rol VP ("La mano del Rey"...) — null para individuales
  texto    String // el reactivo
  orden    Int
  tasks    Task[]         @relation("TaskCompetencias")
  evidences Evidence[]

  @@unique([tipo, grupo, orden])
}

model Evidence {
  id            String      @id @default(cuid())
  userId        String
  user          User        @relation(fields: [userId], references: [id])
  competencyId  String
  competency    Competency  @relation(fields: [competencyId], references: [id])
  taskId        String?
  task          Task?       @relation(fields: [taskId], references: [id])
  deliverableId String?
  deliverable   Deliverable? @relation(fields: [deliverableId], references: [id])
  nota          String
  createdAt     DateTime    @default(now())
}
```

**Verificación:**
- [ ] `npx prisma migrate dev --name fundacion` crea la migración sin errores
- [ ] `npx prisma generate` genera el client
- [ ] git commit "feat(db): schema 4 capas — personal, engagement, desarrollo"

---

### Tarea 3: Singleton Prisma + util de fechas ISO (TDD)

**Objetivo:** Cliente Prisma global y helpers de semana ISO con tests.

**Archivos:** `src/lib/prisma.ts`, `tests/dates.test.ts`, `src/lib/dates.ts`

**Tests primero** (`tests/dates.test.ts`):
```ts
import { describe, it, expect } from 'vitest'
import { isoWeekOf, weekRange } from '@/lib/dates'

describe('isoWeekOf', () => {
  it('calcula semana ISO con año correcto', () => {
    expect(isoWeekOf(new Date('2026-07-06'))).toBe('2026-W28')
    expect(isoWeekOf(new Date('2026-06-29'))).toBe('2026-W27')
    expect(isoWeekOf(new Date('2026-01-01'))).toBe('2026-W01')
    expect(isoWeekOf(new Date('2027-01-01'))).toBe('2026-W53') // año ISO ≠ año calendario
  })
})

describe('weekRange', () => {
  it('devuelve lunes y viernes de la semana ISO', () => {
    const { inicio, fin } = weekRange('2026-W27')
    expect(inicio.toISOString().slice(0, 10)).toBe('2026-06-29')
    expect(fin.toISOString().slice(0, 10)).toBe('2026-07-03')
  })
})
```

**Implementación** (`src/lib/dates.ts`):
```ts
export function isoWeekOf(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day) // jueves de la semana
  const isoYear = date.getUTCFullYear()
  const yearStart = new Date(Date.UTC(isoYear, 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${isoYear}-W${String(week).padStart(2, '0')}`
}

export function weekRange(isoWeek: string): { inicio: Date; fin: Date } {
  const [y, w] = isoWeek.split('-W').map(Number)
  const jan4 = new Date(Date.UTC(y, 0, 4))
  const monday = new Date(jan4)
  monday.setUTCDate(jan4.getUTCDate() - (jan4.getUTCDay() || 7) + 1 + (w - 1) * 7)
  const friday = new Date(monday)
  friday.setUTCDate(monday.getUTCDate() + 4)
  return { inicio: monday, fin: friday }
}
```

`src/lib/prisma.ts` (patrón estándar):
```ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
export const prisma = globalForPrisma.prisma || new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

**Verificación:**
- [ ] Tests de dates fallan antes de implementar, pasan después
- [ ] git commit "feat(lib): prisma singleton + fechas ISO con tests"

---

### Tarea 4: Sesión JWT (TDD, patrón RestaurantOS)

**Objetivo:** `session.ts` con encrypt/decrypt/createSession/deleteSession.

**Archivos:** `tests/session.test.ts`, `src/lib/session.ts`, `src/lib/auth.ts`

**Tests primero** (`tests/session.test.ts`) — probar solo encrypt/decrypt (cookies requieren request context):
```ts
import { describe, it, expect, beforeAll } from 'vitest'

beforeAll(() => { process.env.SESSION_SECRET = 'test-secret-mínimo-32-caracteres!!' })

describe('session encrypt/decrypt', () => {
  it('roundtrip devuelve el userId', async () => {
    const { encrypt, decrypt } = await import('@/lib/session')
    const token = await encrypt({ userId: 'abc123' })
    const payload = await decrypt(token)
    expect(payload?.userId).toBe('abc123')
  })
  it('token inválido devuelve null', async () => {
    const { decrypt } = await import('@/lib/session')
    expect(await decrypt('garbage')).toBeNull()
    expect(await decrypt(undefined)).toBeNull()
  })
})
```

**Implementación:** copiar `src/lib/session.ts` y `src/lib/auth.ts` de RestaurantOS **tal cual** (rutas: `Coding/restaurant-os/src/lib/{session,auth}.ts`) — jose HS256, expiración 30d, cookie `session` httpOnly/lax/secure-en-prod. Único cambio: leer `SECRET` dentro de las funciones (no al importar el módulo) para que los tests puedan setear env primero.

**Verificación:**
- [ ] Tests pasan
- [ ] git commit "feat(auth): sesión JWT jose — patrón RestaurantOS"

---

### Tarea 5: Middleware + Login

**Objetivo:** Rutas protegidas con redirect y página de login funcional.

**Archivos:** `src/middleware.ts`, `src/app/login/page.tsx`, `src/app/login/actions.ts`, `src/app/page.tsx`

**Implementación:** `middleware.ts` copiado de RestaurantOS con `DEFAULT_ROUTE = '/dia'` (la vista futura de Fase 2; por ahora crear `src/app/dia/page.tsx` placeholder con "WTW App — Fase 1"). `src/app/page.tsx` → `redirect('/dia')`.

`src/app/login/actions.ts`:
```ts
'use server'
import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { createSession } from '@/lib/session'

export async function login(_prev: { error?: string } | undefined, formData: FormData) {
  const email = String(formData.get('email') ?? '').toLowerCase().trim()
  const password = String(formData.get('password') ?? '')
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: 'Credenciales inválidas' }
  }
  await createSession(user.id)
  redirect('/dia')
}
```
`page.tsx`: form client component con `useActionState(login, undefined)` — inputs email/password, error en rojo, estilo Tailwind mínimo (branding VP `#0A7C82` en el botón). **Consultar docs de Next 16 en `node_modules/next/dist/docs/` para la firma exacta de server actions/useActionState antes de escribir.**

**Verificación:**
- [ ] Sin sesión, `/dia` redirige a `/login`; con sesión, `/login` redirige a `/dia`
- [ ] Login con credenciales del seed (Tarea 9) funciona end-to-end (verificar tras el seed)
- [ ] git commit "feat(auth): middleware + login"

---

### Tarea 6: PAT para skills (TDD)

**Objetivo:** Autenticación Bearer para `/api/v1/*` — los skills de Claude usan un token personal.

**Archivos:** `tests/api-auth.test.ts`, `src/lib/api-auth.ts`, `scripts/generate-token.ts`

**Tests primero** (`tests/api-auth.test.ts`):
```ts
import { describe, it, expect } from 'vitest'
import { hashToken } from '@/lib/api-auth'

describe('hashToken', () => {
  it('sha256 determinista en hex', () => {
    expect(hashToken('wtw_abc')).toBe(hashToken('wtw_abc'))
    expect(hashToken('wtw_abc')).toMatch(/^[a-f0-9]{64}$/)
    expect(hashToken('wtw_abc')).not.toBe(hashToken('wtw_abd'))
  })
})
```

**Implementación** (`src/lib/api-auth.ts`):
```ts
import { createHash, randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import type { User } from '@prisma/client'

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function newToken(): string {
  return 'wtw_' + randomBytes(24).toString('base64url')
}

export async function apiUser(req: Request): Promise<User | null> {
  const header = req.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice(7)
  return prisma.user.findUnique({ where: { apiTokenHash: hashToken(token) } })
}
```
`scripts/generate-token.ts` (correr con `npx tsx`): recibe email por argv, genera `newToken()`, guarda `apiTokenHash` en el user, imprime el token UNA vez con instrucción de guardarlo en `~/.wtw-token`.

**Verificación:**
- [ ] Tests pasan
- [ ] git commit "feat(api): PAT bearer auth + generador de token"

---

### Tarea 7: API v1 — projects y weeks (TDD)

**Objetivo:** Endpoints que `/wtw-semana` usará: listar proyectos, crear semana completa (wins + tasks + blocks anidados), leer semana.

**Archivos:** `tests/weeks.test.ts`, `src/app/api/v1/projects/route.ts`, `src/app/api/v1/weeks/route.ts`, `src/app/api/v1/weeks/[isoWeek]/route.ts`

**Tests primero** (`tests/weeks.test.ts`) — contra la DB dev, con limpieza:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createWeekPayload } from '@/app/api/v1/weeks/service'

beforeEach(async () => {
  await prisma.$transaction([
    prisma.timeEntry.deleteMany(), prisma.block.deleteMany(), prisma.dodItem.deleteMany(),
    prisma.task.deleteMany(), prisma.win.deleteMany(), prisma.week.deleteMany(),
    prisma.project.deleteMany(), prisma.user.deleteMany(),
  ])
})

describe('createWeekPayload', () => {
  it('crea semana con wins, tasks con dod, y blocks ligados', async () => {
    const user = await prisma.user.create({ data: { email: 'm@vp.mx', nombre: 'Mau', passwordHash: 'x' } })
    const proj = await prisma.project.create({ data: { userId: user.id, nombre: 'Liverpool' } })
    const week = await createWeekPayload(user.id, {
      isoWeek: '2026-W28', factorUsado: 1.4,
      wins: [{ posicion: 1, titulo: 'Data 2026', dod: 'supuestos acordados' }],
      tasks: [{ ref: 't1', titulo: 'KPIs región 1', projectNombre: 'Liverpool', winPosicion: 1, estimadoMin: 180, dod: ['región cerrada'] }],
      blocks: [{ fecha: '2026-07-06', inicio: '09:00', fin: '12:00', tipo: 'tarea', taskRef: 't1', titulo: 'KPIs región 1', planMin: 180 }],
    })
    const full = await prisma.week.findUnique({ where: { id: week.id }, include: { wins: true, tasks: { include: { dodItems: true } }, blocks: true } })
    expect(full!.wins).toHaveLength(1)
    expect(full!.tasks[0].projectId).toBe(proj.id)
    expect(full!.tasks[0].winId).toBe(full!.wins[0].id)
    expect(full!.blocks[0].taskId).toBe(full!.tasks[0].id)
    expect(full!.rangoInicio.toISOString().slice(0, 10)).toBe('2026-07-06')
  })
  it('rechaza semana duplicada por usuario', async () => {
    const user = await prisma.user.create({ data: { email: 'm@vp.mx', nombre: 'Mau', passwordHash: 'x' } })
    const payload = { isoWeek: '2026-W28', factorUsado: 1.4, wins: [], tasks: [], blocks: [] }
    await createWeekPayload(user.id, payload)
    await expect(createWeekPayload(user.id, payload)).rejects.toThrow()
  })
})
```

**Implementación:** la lógica vive en `src/app/api/v1/weeks/service.ts` (testeable sin HTTP); los `route.ts` son wrappers delgados:
- `service.ts`: `createWeekPayload(userId, payload)` — transacción: upsert-por-nombre de projects referenciados, crea Week (rango desde `weekRange(isoWeek)`), Wins, Tasks (resolviendo `projectNombre`→projectId, `winPosicion`→winId, creando DodItems), Blocks (resolviendo `taskRef` → taskId por mapa ref→id). `getWeek(userId, isoWeek)` — include completo ordenado por fecha/orden.
- `projects/route.ts`: `GET` lista proyectos del `apiUser(req)` (401 si null); `POST` crea `{nombre, cliente?, tipo?, color?}`.
- `tasks/route.ts`: `POST` captura al inbox — `{titulo, projectNombre?, alcance?, dolorCliente?}` → Task con `estatus: backlog`, sin semana. Es el endpoint de captura rápida (≤10 seg); el triage ocurre en el ritual.
- `weeks/route.ts`: `POST` → `createWeekPayload`; `weeks/[isoWeek]/route.ts`: `GET` → `getWeek`. Todos: 401 sin PAT válido, 422 con `error` legible si el payload no cumple (validar con checks explícitos, sin dependencia de zod por ahora).

**Verificación:**
- [ ] Tests de service pasan
- [ ] `curl -H "Authorization: Bearer $TOKEN" localhost:3000/api/v1/projects` responde JSON (tras seed)
- [ ] git commit "feat(api): projects + weeks con payload anidado"

---

### Tarea 8: API v1 — timer con regla un-solo-timer (TDD)

**Objetivo:** Start/stop de cronómetro; iniciar uno detiene el que corre — la regla de negocio central.

**Archivos:** `tests/timer.test.ts`, `src/app/api/v1/timer/service.ts`, `src/app/api/v1/timer/route.ts`

**Tests primero** (`tests/timer.test.ts`, misma limpieza que weeks):
```ts
import { startTimer, stopTimer, runningEntry } from '@/app/api/v1/timer/service'
// setup: user + project + week + 2 tasks (helpers locales)

it('start crea entry corriendo y pone task in_progress', async () => {
  const e = await startTimer(user.id, taskA.id)
  expect(e.stoppedAt).toBeNull()
  expect((await prisma.task.findUnique({ where: { id: taskA.id } }))!.estatus).toBe('in_progress')
})
it('start de otra task detiene la primera y acumula seconds', async () => {
  await startTimer(user.id, taskA.id)
  await new Promise(r => setTimeout(r, 1100))
  await startTimer(user.id, taskB.id)
  const entries = await prisma.timeEntry.findMany({ where: { taskId: taskA.id } })
  expect(entries[0].stoppedAt).not.toBeNull()
  expect(entries[0].seconds).toBeGreaterThanOrEqual(1)
  expect((await runningEntry(user.id))!.taskId).toBe(taskB.id)
})
it('stop sin timer corriendo devuelve null sin error', async () => {
  expect(await stopTimer(user.id)).toBeNull()
})
```

**Implementación** (`service.ts`):
```ts
import { prisma } from '@/lib/prisma'

export async function runningEntry(userId: string) {
  return prisma.timeEntry.findFirst({ where: { userId, stoppedAt: null } })
}

export async function stopTimer(userId: string) {
  const running = await runningEntry(userId)
  if (!running) return null
  const stoppedAt = new Date()
  return prisma.timeEntry.update({
    where: { id: running.id },
    data: { stoppedAt, seconds: Math.round((stoppedAt.getTime() - running.startedAt.getTime()) / 1000) },
  })
}

export async function startTimer(userId: string, taskId: string) {
  await stopTimer(userId)
  const [entry] = await prisma.$transaction([
    prisma.timeEntry.create({ data: { userId, taskId, startedAt: new Date() } }),
    prisma.task.update({ where: { id: taskId }, data: { estatus: 'in_progress' } }),
  ])
  return entry
}
```
`route.ts`: `GET` → entry corriendo (o null) + segundos acumulados de la task; `POST {action:"start", taskId}` / `{action:"stop"}` con `apiUser`.

**Verificación:**
- [ ] Tests pasan (incluida la regla un-solo-timer)
- [ ] git commit "feat(api): timer start/stop con regla un-solo-timer"

---

### Tarea 9: Catálogo VP + seed

**Objetivo:** Extraer las competencias reales del Excel 360 y sembrar la DB completa.

**Archivos:** `scripts/extract_competencias.py`, `prisma/seed-data/competencias-vp.ts` (generado), `prisma/seed.ts`, `tests/seed.test.ts`

**Implementación — extracción** (`scripts/extract_competencias.py`, correr con `/opt/anaconda3/bin/python3`):
```python
import openpyxl, json
SRC = '/Users/vpconsulting/Library/CloudStorage/OneDrive-VPConsulting/VP/Consolidado Anual de Evaluación de Desempeño - Mau.xlsx'
wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
ws = wb['MRO - Merlín']
rows = [[c for c in r] for r in ws.iter_rows(values_only=True)]
individuales, roles, seccion, rol_actual = [], {}, None, None
for r in rows:
    vals = [str(v).strip() for v in r if v is not None and str(v).strip()]
    if not vals: continue
    joined = ' '.join(vals)
    if joined.startswith('Sección individual'): seccion = 'ind'; continue
    if joined.startswith('Sección de evaluación de Rol'): seccion = 'rol'; continue
    if joined.startswith('Sección de Retroalimentación'): break
    if seccion == 'ind' and isinstance(r[0], (int, float)) and len(vals) >= 2:
        individuales.append(vals[1])
    elif seccion == 'rol':
        if vals[0].endswith(':') and not isinstance(r[0], (int, float)):
            rol_actual = vals[0].rstrip(':'); roles[rol_actual] = []
        elif isinstance(r[0], (int, float)) and rol_actual and len(vals) >= 2:
            roles[rol_actual].append(vals[1])
out = 'export const CONDUCTAS_INDIVIDUALES: string[] = ' + json.dumps(individuales, ensure_ascii=False, indent=2)
out += '\n\nexport const ROLES_VP: Record<string, string[]> = ' + json.dumps(roles, ensure_ascii=False, indent=2) + '\n'
open('prisma/seed-data/competencias-vp.ts', 'w').write(out)
print(f'{len(individuales)} conductas, {len(roles)} roles')
```
Esperado: **20 conductas, 10 roles** (validar en el print; el rol "PROMEDIO" no debe colarse — si aparece, filtrarlo).

**Implementación — seed** (`prisma/seed.ts`):
1. `Level`: Analista(1), Consultor Sr(2, expectativas del PDF si están a mano), Gerente(3, "liderar tramos táctico-operativos, asignar y dar orientación a equipos, establecer proximidad con stakeholders"), Gerente Sr(4) — `upsert` por nombre.
2. `Competency`: 20 individuales (`tipo:individual, orden:i`) + reactivos por rol (`tipo:rol, grupo:<nombre rol>, orden:i`) desde `seed-data/competencias-vp.ts`.
3. `User` Mau: email `mgonzalez@vpconsulting.mx`, nombre "Mauricio González", password `bcrypt.hash(process.env.SEED_PASSWORD ?? 'cambiar-ya', 10)`, horario 09-18, comida 14-15, buffer 25, factorManual 1.4, nivelActual Consultor Sr, nivelObjetivo Gerente.
4. `Project`: Liverpool (facturable, cliente "El Puerto de Liverpool"), Cuervo (facturable), VP Interno (interno), Desarrollo Personal (desarrollo) — colores distintos, upsert por (userId, nombre).
5. `Deliverable` seed mínimo Liverpool: "Gemelo digital" y "KPIs de transporte" (sin numeroSow — se completan después desde el SOW real).
6. `Week` en curso (usar `isoWeekOf(new Date())`) con estatus `active`, factorUsado 1.4 — vacía; el primer `/wtw-semana` migrado la llenará.

**Tests** (`tests/seed.test.ts`): tras correr seed — 4 levels, ≥20 competencias individuales, 10 grupos de rol, user Mau con niveles ligados, 4 proyectos.

**Verificación:**
- [ ] `python3 scripts/extract_competencias.py` imprime "20 conductas, 10 roles"
- [ ] `npx prisma db seed` corre idempotente (2 veces sin error)
- [ ] Tests de seed pasan
- [ ] git commit "feat(seed): catálogo VP + usuario + proyectos + semana activa"

---

### Tarea 10: Verificación integral de fase

**Objetivo:** Todo verde de punta a punta.

**Implementación:**
```bash
npx prisma migrate reset --force   # migra + seed desde cero
npx vitest run                     # toda la suite
npm run build                      # build de producción sin errores
npx tsx scripts/generate-token.ts mgonzalez@vpconsulting.mx  # PAT real
curl -s -H "Authorization: Bearer <token>" localhost:3000/api/v1/projects | jq
```

**Verificación:**
- [ ] Suite completa en verde, build sin errores
- [ ] Login manual en browser con las credenciales del seed
- [ ] `GET /api/v1/projects` devuelve los 4 proyectos con PAT
- [ ] `GET /api/v1/weeks/<semana-actual>` devuelve la semana activa
- [ ] git commit "chore: fase 1 fundación completa y verificada"

---

## Orden de dependencias

1 → 2 → 3 → {4, 6} → 5 → 7 → 8 → 9 → 10. Las tareas 4 y 6 son independientes entre sí (paralelizables). 7 y 8 dependen de 3+6; 5 depende de 4; 9 depende de 2+3; 10 de todas.

## Fuera de esta fase

Vista Mi Día real (Fase 2), PWA (Fase 2), sync .ics + capacidad (Fase 3), migración de skills (Fase 3), deploy Vercel/Neon (Fase 2), vistas de proyectos/desarrollo (Fase 4).
