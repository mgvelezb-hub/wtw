# Plan de implementación — Modo Focus

> Basado en el diseño aprobado: `docs/plans/2026-07-20-modo-focus-design.md`.
> Repo: `~/projects/wtw-app`.

## Corrección de ruta descubierta al mapear archivos

El diseño dice ruta `/dia/focus`. `src/app/(app)/layout.tsx` envuelve **todo** lo que vive
dentro de `(app)/` con `<AppShell>` (sidebar) — no hay forma de que una ruta anidada ahí
adentro "salga" de ese layout en Next.js App Router sin restructurar el route group entero.
Para lograr una pantalla de verdad sin chrome, la ruta vive **fuera** de `(app)/`, como
segmento top-level hermano: **`src/app/focus/page.tsx` → URL `/focus`** (no `/dia/focus`).
Necesita su propio `verifySession()` (no lo hereda de `(app)/layout.tsx`). Es el mismo patrón
de 3 líneas usado en todos lados del repo — cero riesgo, cero lógica nueva de auth.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/focus-selectors.ts` | Funciones puras: bloque activo, siguiente tarea, próxima junta |
| `tests/focus-selectors.test.ts` | Tests de las funciones puras (TDD, primero) |
| `src/app/focus/useClock.ts` | Hook: tick de reloj (ms) + hora "HH:MM" derivada |
| `src/app/focus/useWakeLock.ts` | Hook: mantener pantalla encendida + flag de soporte |
| `src/app/focus/FocusClock.tsx` | Presentacional: reloj digital 24h + fecha |
| `src/app/focus/FocusMeeting.tsx` | Presentacional: próxima junta real, resaltada a 5 min |
| `src/app/focus/FocusNextShadow.tsx` | Presentacional: siguiente actividad en sombra |
| `src/app/focus/StartNextModal.tsx` | Presentacional: modal "¿iniciar la siguiente ahora?" |
| `src/app/focus/FocusActivity.tsx` | Presentacional: actividad activa (título, DoD, timer, controles) |
| `src/app/focus/FocusView.tsx` | Orquestador cliente: junta todo, maneja acciones y estado |
| `src/app/focus/page.tsx` | Server component: auth + datos de hoy |
| `src/app/(app)/dia/DiaBoard.tsx` (editar) | Botón de entrada "🎯 Modo Focus" en la hero card |

Reutilizado sin tocar: `getDayBlocks` (`dia/service.ts`), `startTimerAction` /
`stopTimerAction` / `toggleDodItemAction` / `markTaskDoneAction` (`dia/actions.ts`).

**Nota de tipografía:** el reloj usa la pila serif del sistema (`ui-serif, Georgia, 'Times
New Roman', serif` vía `font-serif` de Tailwind) en vez de cargar una fuente nueva — logra el
look de lujo sin añadir una dependencia de web font ni riesgo de FOUT en una vista de pantalla
completa. Si más adelante se quiere una tipografía a medida, es un cambio aislado de una línea.

---

### Tarea 1: Tests de los selectores puros de Focus (TDD — primero)

**Objetivo:** Fijar el contrato de `getActiveBlock`, `getNextTaskBlock` y `getUpcomingMeeting`
antes de implementarlos, siguiendo el patrón ya usado en `tests/day-logic.test.ts`.

**Archivos a crear:**
- `tests/focus-selectors.test.ts`

**Implementación:**
```ts
import { describe, it, expect } from 'vitest'
import { getActiveBlock, getNextTaskBlock, getUpcomingMeeting, type FocusBlock } from '@/lib/focus-selectors'

function block(overrides: Partial<FocusBlock>): FocusBlock {
  return {
    id: 'x',
    inicio: '09:00',
    fin: '10:00',
    tipo: 'tarea',
    titulo: 'Actividad',
    planMin: 60,
    taskId: 'task-1',
    done: false,
    externa: false,
    bloqueante: true,
    runningSince: null,
    ...overrides,
  }
}

describe('getActiveBlock', () => {
  it('devuelve el bloque con runningSince activo', () => {
    const blocks = [block({ id: 'a' }), block({ id: 'b', runningSince: '2026-07-20T15:00:00.000Z' })]
    expect(getActiveBlock(blocks)?.id).toBe('b')
  })

  it('devuelve null si ninguno está corriendo', () => {
    expect(getActiveBlock([block({ id: 'a' })])).toBeNull()
  })
})

describe('getNextTaskBlock', () => {
  it('devuelve la siguiente tarea cronometrable después de la hora dada', () => {
    const blocks = [
      block({ id: 'a', inicio: '09:00', done: true }),
      block({ id: 'b', inicio: '14:00' }),
      block({ id: 'c', inicio: '11:00' }),
    ]
    expect(getNextTaskBlock(blocks, '10:30')?.id).toBe('c')
  })

  it('ignora juntas externas y bloques sin taskId', () => {
    const blocks = [
      block({ id: 'a', inicio: '11:00', externa: true }),
      block({ id: 'b', inicio: '12:00', taskId: null }),
      block({ id: 'c', inicio: '13:00' }),
    ]
    expect(getNextTaskBlock(blocks, '10:00')?.id).toBe('c')
  })

  it('devuelve null si no queda ninguna tarea después', () => {
    expect(getNextTaskBlock([block({ id: 'a', inicio: '09:00' })], '10:00')).toBeNull()
  })
})

describe('getUpcomingMeeting', () => {
  it('devuelve la próxima junta bloqueante con minutos restantes', () => {
    const blocks = [block({ id: 'j', inicio: '11:00', tipo: 'junta', externa: true, bloqueante: true })]
    const meeting = getUpcomingMeeting(blocks, '10:50', 5)
    expect(meeting?.block.id).toBe('j')
    expect(meeting?.minutesUntil).toBe(10)
    expect(meeting?.highlight).toBe(false)
  })

  it('resalta cuando faltan menos minutos que el umbral', () => {
    const blocks = [block({ id: 'j', inicio: '11:00', tipo: 'junta', externa: true, bloqueante: true })]
    const meeting = getUpcomingMeeting(blocks, '10:57', 5)
    expect(meeting?.minutesUntil).toBe(3)
    expect(meeting?.highlight).toBe(true)
  })

  it('ignora juntas no bloqueantes (informativas)', () => {
    const blocks = [block({ id: 'j', inicio: '11:00', tipo: 'junta', externa: true, bloqueante: false })]
    expect(getUpcomingMeeting(blocks, '10:50', 5)).toBeNull()
  })

  it('devuelve null si no hay juntas próximas', () => {
    expect(getUpcomingMeeting([block({ id: 'a', inicio: '09:00' })], '10:00', 5)).toBeNull()
  })
})
```

**Tests:** este archivo ES los tests — correr `npx vitest run tests/focus-selectors.test.ts` y
confirmar que **fallan** (el módulo `@/lib/focus-selectors` no existe todavía).

**Verificación:**
- [ ] `npx vitest run tests/focus-selectors.test.ts` falla con "Cannot find module" — confirma que estamos en rojo antes de implementar

---

### Tarea 2: Implementar los selectores puros

**Objetivo:** Hacer pasar los tests de la Tarea 1.

**Archivos a crear:**
- `src/lib/focus-selectors.ts`

**Implementación:**
```ts
export type FocusBlock = {
  id: string
  inicio: string // "HH:MM" | "flex"
  fin: string
  tipo: string
  titulo: string
  planMin: number
  taskId: string | null
  done: boolean
  externa: boolean
  bloqueante: boolean
  runningSince: string | null
}

export function getActiveBlock<T extends FocusBlock>(blocks: T[]): T | null {
  return blocks.find((b) => b.runningSince !== null) ?? null
}

export function getNextTaskBlock<T extends FocusBlock>(blocks: T[], afterInicio: string): T | null {
  const candidatos = blocks
    .filter(
      (b) =>
        b.tipo === 'tarea' &&
        !b.externa &&
        !b.done &&
        b.taskId !== null &&
        b.inicio !== 'flex' &&
        b.inicio > afterInicio
    )
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
  return candidatos[0] ?? null
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export type UpcomingMeeting<T> = { block: T; minutesUntil: number; highlight: boolean }

export function getUpcomingMeeting<T extends FocusBlock>(
  blocks: T[],
  nowHHMM: string,
  thresholdMin: number
): UpcomingMeeting<T> | null {
  const juntas = blocks
    .filter((b) => b.externa && b.bloqueante && !b.done && b.inicio !== 'flex' && b.inicio > nowHHMM)
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
  const next = juntas[0]
  if (!next) return null
  const minutesUntil = toMin(next.inicio) - toMin(nowHHMM)
  return { block: next, minutesUntil, highlight: minutesUntil <= thresholdMin }
}
```

**Tests:** los ya escritos en la Tarea 1.

**Verificación:**
- [ ] `npx vitest run tests/focus-selectors.test.ts` pasa en verde, las 10 aserciones
- [ ] `npx tsc --noEmit` sin errores nuevos

---

### Tarea 3: Hook de reloj (`useClock`)

**Objetivo:** Un tick de 1 segundo que alimenta tanto el reloj digital como el cálculo en
vivo del cronómetro y de "próxima junta" — evitando el hydration mismatch documentado en
`CLAUDE.md` (nunca `Date.now()` como estado inicial en un componente server-rendered).

**Archivos a crear:**
- `src/app/focus/useClock.ts`

**Implementación:**
```ts
'use client'

import { useEffect, useState } from 'react'

export type Clock = { tickMs: number | null; nowHHMM: string | null }

// Mismo patrón que el tick de DiaBoard.tsx (líneas 134-142): arranca en null para
// no romper la hidratación, se llena en el primer efecto tras montar.
export function useClock(): Clock {
  const [tickMs, setTickMs] = useState<number | null>(null)

  useEffect(() => {
    setTickMs(Date.now())
    const id = setInterval(() => setTickMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (tickMs === null) return { tickMs: null, nowHHMM: null }
  const d = new Date(tickMs)
  const nowHHMM = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return { tickMs, nowHHMM }
}
```

**Tests:** ninguno — es un hook de UI de un solo `setInterval`, sin ramas de lógica
verificables sin un navegador real; se cubre en la verificación manual de la Tarea 11.

**Verificación:**
- [ ] `npx tsc --noEmit` sin errores nuevos

---

### Tarea 4: Hook de pantalla siempre encendida (`useWakeLock`)

**Objetivo:** Mantener la pantalla activa mientras se está en Focus; avisar una sola vez si
el navegador no lo soporta; volver a pedirlo si el usuario regresa a la pestaña (el Wake Lock
se libera automáticamente cuando la pestaña pierde visibilidad — comportamiento estándar del
API, no un bug).

**Archivos a crear:**
- `src/app/focus/useWakeLock.ts`

**Implementación:**
```ts
'use client'

import { useEffect, useRef, useState } from 'react'

export function useWakeLock(active: boolean): { supported: boolean } {
  const [supported, setSupported] = useState(true)
  const lockRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!active) return
    if (!('wakeLock' in navigator)) {
      setSupported(false)
      return
    }

    let cancelled = false

    async function requestLock() {
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (cancelled) {
          await lock.release()
          return
        }
        lockRef.current = lock
      } catch {
        setSupported(false)
      }
    }

    requestLock()

    function onVisibilityChange() {
      if (document.visibilityState === 'visible' && lockRef.current === null) requestLock()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      lockRef.current?.release()
      lockRef.current = null
    }
  }, [active])

  return { supported }
}
```

**Tests:** ninguno — depende del Wake Lock API real del navegador, no simulable útilmente en
jsdom/node. Se verifica manualmente (Tarea 11).

**Verificación:**
- [ ] `npx tsc --noEmit` sin errores nuevos (puede requerir `"lib": [..., "dom"]` ya presente en tsconfig — confirmar que `WakeLockSentinel` resuelve sin instalar tipos extra; si TS se queja, castear `navigator as Navigator & { wakeLock: WakeLock }` mínimamente)

---

### Tarea 5: `FocusClock` — reloj digital y fecha

**Objetivo:** Zona de reloj: hora 24h grande estilo serif de lujo + fecha discreta debajo.

**Archivos a crear:**
- `src/app/focus/FocusClock.tsx`

**Implementación:**
```tsx
'use client'

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export function FocusClock({ tickMs }: { tickMs: number | null }) {
  if (tickMs === null) return null
  const d = new Date(tickMs)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const fecha = `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`

  return (
    <div className="text-right">
      <p className="font-serif text-6xl font-thin tabular-nums tracking-wide text-[#ededed]">
        {hh}:{mm}
      </p>
      <p className="mt-1 text-sm capitalize tracking-wide text-[#8a8578]">{fecha}</p>
    </div>
  )
}
```

**Tests:** ninguno — presentacional puro sin lógica de rama; cubierto en verificación visual.

**Verificación:**
- [ ] Renderiza sin error con un `tickMs` fijo pasado a mano en el navegador (Tarea 11)

---

### Tarea 6: `FocusMeeting` — próxima junta real

**Objetivo:** Mostrar la próxima junta bloqueante del calendario; resaltarla cuando el umbral
de 5 minutos se cumple; no ocupar espacio si no hay ninguna.

**Archivos a crear:**
- `src/app/focus/FocusMeeting.tsx`

**Implementación:**
```tsx
'use client'

import type { UpcomingMeeting, FocusBlock } from '@/lib/focus-selectors'

export function FocusMeeting({ meeting }: { meeting: UpcomingMeeting<FocusBlock> | null }) {
  if (!meeting) return null
  const { block, minutesUntil, highlight } = meeting

  return (
    <div
      className={`rounded-lg border px-4 py-2 text-right transition-colors ${
        highlight ? 'border-[#c9a24b] bg-[#c9a24b]/10 animate-pulse' : 'border-white/10'
      }`}
    >
      <p className="text-[11px] uppercase tracking-wide text-[#8a8578]">Próxima junta</p>
      <p className="text-sm font-medium text-[#ededed]">{block.titulo}</p>
      <p className={`text-xs ${highlight ? 'text-[#c9a24b]' : 'text-[#8a8578]'}`}>
        {block.inicio} · en {minutesUntil} min
      </p>
    </div>
  )
}
```

**Tests:** ninguno — presentacional; la lógica de umbral ya está probada en `focus-selectors.test.ts`.

**Verificación:**
- [ ] Con `meeting: null` no renderiza nada (visual, Tarea 11)
- [ ] Con `highlight: true` se ve el acento dorado (visual, Tarea 11)

---

### Tarea 7: `FocusNextShadow` — siguiente actividad en sombra

**Objetivo:** Franja inferior atenuada con la siguiente actividad planeada, y aviso si ya se
pasó su horario por el overrun de la actividad actual.

**Archivos a crear:**
- `src/app/focus/FocusNextShadow.tsx`

**Implementación:**
```tsx
'use client'

import type { FocusBlock } from '@/lib/focus-selectors'

export function FocusNextShadow({ next, nowHHMM }: { next: FocusBlock | null; nowHHMM: string | null }) {
  if (!next) {
    return <p className="text-center text-sm text-white/20">Sin más actividades planeadas hoy</p>
  }

  const atrasada = !!nowHHMM && nowHHMM > next.inicio

  return (
    <p className="text-center text-sm text-white/30">
      Sigue: <span className="text-white/50">{next.titulo}</span>{' '}
      {atrasada ? (
        <span className="text-[#c9a24b]/70">— debía empezar a las {next.inicio}</span>
      ) : (
        <>a las {next.inicio}</>
      )}
    </p>
  )
}
```

**Tests:** ninguno — presentacional puro.

**Verificación:**
- [ ] Visual: con `next: null` muestra el mensaje de "sin más actividades" (Tarea 11)
- [ ] Visual: con una actividad atrasada, el tono ámbar aparece (Tarea 11)

---

### Tarea 8: `StartNextModal` — modal de arranque anticipado

**Objetivo:** Preguntar si se arranca la siguiente actividad al terminar antes de tiempo, sin
autoiniciar nunca nada solo.

**Archivos a crear:**
- `src/app/focus/StartNextModal.tsx`

**Implementación:**
```tsx
'use client'

export function StartNextModal({
  siguienteTitulo,
  onIniciar,
  onEsperar,
}: {
  siguienteTitulo: string
  onIniciar: () => void
  onEsperar: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#141414] p-6 text-center">
        <p className="text-sm text-[#8a8578]">Terminaste antes de tiempo</p>
        <p className="mt-2 text-lg font-medium text-[#ededed]">¿Iniciar "{siguienteTitulo}" ahora?</p>
        <div className="mt-5 flex justify-center gap-3">
          <button
            onClick={onEsperar}
            className="rounded-md px-4 py-2 text-sm font-medium text-white/60 hover:text-white"
          >
            Esperar su horario
          </button>
          <button
            onClick={onIniciar}
            className="rounded-md bg-[#c9a24b] px-4 py-2 text-sm font-bold text-[#1a1a1a] hover:bg-[#b8923f]"
          >
            Iniciar ahora
          </button>
        </div>
      </div>
    </div>
  )
}
```

**Tests:** ninguno — presentacional con dos callbacks, sin lógica propia.

**Verificación:**
- [ ] Visual: aparece centrado sobre fondo oscurecido (Tarea 11)

---

### Tarea 9: `FocusActivity` — actividad activa

**Objetivo:** El bloque central: título, proyecto, DoD checklist, cronómetro en vivo vs.
planeado, y controles Pausar/Terminar. Reutiliza las server actions existentes de `/dia`.

**Archivos a crear:**
- `src/app/focus/FocusActivity.tsx`

**Implementación:**
```tsx
'use client'

import { useTransition } from 'react'
import type { DayBlockView } from '@/app/(app)/dia/service'
import { stopTimerAction, toggleDodItemAction } from '@/app/(app)/dia/actions'

function fmt(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.floor(totalSeconds % 60)
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

export function FocusActivity({
  activity,
  tickMs,
  onTerminar,
}: {
  activity: DayBlockView
  tickMs: number | null
  onTerminar: (taskId: string, blockFin: string) => void
}) {
  const [pending, startTransition] = useTransition()

  const seconds =
    tickMs === null || !activity.runningSince
      ? activity.accumulatedSeconds
      : activity.accumulatedSeconds + (tickMs - new Date(activity.runningSince).getTime()) / 1000
  const over = seconds > activity.planMin * 60

  return (
    <div className="mx-auto max-w-2xl text-center">
      {activity.proyecto && (
        <span
          className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide text-white/90"
          style={{ backgroundColor: activity.proyecto.color }}
        >
          {activity.proyecto.nombre}
        </span>
      )}
      <h1 className="mt-3 font-serif text-4xl font-light text-[#ededed]">{activity.titulo}</h1>

      <p className={`mt-6 font-mono text-7xl font-bold tabular-nums ${over ? 'text-[#c9a24b]' : 'text-white'}`}>
        {fmt(seconds)}
      </p>
      <p className="mt-1 text-sm text-[#8a8578]">de {activity.planMin}min planeados</p>

      {activity.dodItems.length > 0 && (
        <ul className="mx-auto mt-6 max-w-sm space-y-2 text-left">
          {activity.dodItems.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={d.done}
                disabled={pending}
                onChange={() => startTransition(() => void toggleDodItemAction(d.id))}
              />
              <span className={d.done ? 'text-white/30 line-through' : 'text-white/80'}>{d.texto}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 flex justify-center gap-3">
        <button
          disabled={pending}
          onClick={() => startTransition(() => void stopTimerAction())}
          className="rounded-md bg-white/10 px-5 py-2 text-sm font-bold text-white hover:bg-white/20"
        >
          ❚❚ Pausar
        </button>
        <button
          disabled={pending || !activity.taskId}
          onClick={() => activity.taskId && onTerminar(activity.taskId, activity.fin)}
          className="rounded-md bg-[#15803d] px-5 py-2 text-sm font-bold text-white hover:bg-[#12692f]"
        >
          ✓ Terminar
        </button>
      </div>
    </div>
  )
}
```

**Tests:** ninguno — presentacional; `fmt` es trivial y ya tiene equivalente probado
implícitamente en el uso productivo de DiaBoard. `onTerminar` se prueba a nivel de integración
manual (Tarea 11) porque orquesta `markTaskDoneAction` + el modal, que vive en `FocusView`.

**Verificación:**
- [ ] `npx tsc --noEmit` sin errores nuevos
- [ ] Visual: el número de tiempo pasa a ámbar al rebasar `planMin` (Tarea 11)

---

### Tarea 10: `FocusView` — orquestador

**Objetivo:** Unir reloj, wake lock, selectores y las 4 zonas visuales; manejar el flujo de
"terminé antes de tiempo" con el modal; salir con X o Esc.

**Archivos a crear:**
- `src/app/focus/FocusView.tsx`

**Implementación:**
```tsx
'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { DayBlockView } from '@/app/(app)/dia/service'
import { startTimerAction, markTaskDoneAction } from '@/app/(app)/dia/actions'
import { getActiveBlock, getNextTaskBlock, getUpcomingMeeting } from '@/lib/focus-selectors'
import { useClock } from './useClock'
import { useWakeLock } from './useWakeLock'
import { FocusClock } from './FocusClock'
import { FocusMeeting } from './FocusMeeting'
import { FocusNextShadow } from './FocusNextShadow'
import { FocusActivity } from './FocusActivity'
import { StartNextModal } from './StartNextModal'

const MEETING_THRESHOLD_MIN = 5

export function FocusView({ blocks }: { blocks: DayBlockView[] }) {
  const router = useRouter()
  const { tickMs, nowHHMM } = useClock()
  const [, startTransition] = useTransition()
  const [modalNext, setModalNext] = useState<DayBlockView | null>(null)

  const activity = getActiveBlock(blocks)
  useWakeLock(activity !== null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') router.push('/dia')
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [router])

  const next = nowHHMM ? getNextTaskBlock(blocks, activity?.inicio ?? nowHHMM) : null
  const meeting = nowHHMM ? getUpcomingMeeting(blocks, nowHHMM, MEETING_THRESHOLD_MIN) : null

  function handleTerminar(taskId: string, blockFin: string) {
    const eraTemprano = !!nowHHMM && nowHHMM < blockFin
    startTransition(() => {
      void markTaskDoneAction(taskId).then(() => {
        router.refresh()
        if (eraTemprano && next) setModalNext(next)
      })
    })
  }

  function handleIniciarSiguiente() {
    if (!modalNext?.taskId) return
    startTransition(() => {
      void startTimerAction(modalNext.taskId!).then(() => router.refresh())
    })
    setModalNext(null)
  }

  return (
    <div className="flex min-h-dvh flex-col justify-between bg-[#0a0a0a] p-8">
      <div className="flex items-start justify-between">
        <button onClick={() => router.push('/dia')} className="text-2xl text-white/30 hover:text-white/70">
          ✕
        </button>
        <div className="flex items-start gap-4">
          <FocusMeeting meeting={meeting} />
          <FocusClock tickMs={tickMs} />
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center">
        {activity ? (
          <FocusActivity activity={activity} tickMs={tickMs} onTerminar={handleTerminar} />
        ) : (
          <p className="text-center text-lg text-white/40">Sin actividad en curso — inicia una desde /dia</p>
        )}
      </div>

      <FocusNextShadow next={next} nowHHMM={nowHHMM} />

      {modalNext && (
        <StartNextModal
          siguienteTitulo={modalNext.titulo}
          onIniciar={handleIniciarSiguiente}
          onEsperar={() => setModalNext(null)}
        />
      )}
    </div>
  )
}
```

**Tests:** ninguno directo — orquesta hooks/componentes de UI real (wake lock, teclado,
router) no simulables útilmente sin navegador. La lógica de decisión pura que sí importa
(cuál es la próxima tarea, si la junta se resalta) ya está probada en `focus-selectors.test.ts`
(Tarea 1); aquí solo se cablea.

**Verificación:**
- [ ] `npx tsc --noEmit` sin errores nuevos
- [ ] Flujo completo en navegador (Tarea 11)

---

### Tarea 11: `page.tsx` — ruta `/focus`

**Objetivo:** Server component con su propio chequeo de sesión (no hereda `AppShell`),
trae los bloques de HOY y renderiza `FocusView`.

**Archivos a crear:**
- `src/app/focus/page.tsx`

**Implementación:**
```tsx
import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import { todayStr } from '@/lib/dates'
import { getDayBlocks } from '@/app/(app)/dia/service'
import { FocusView } from './FocusView'

export default async function FocusPage() {
  const session = await verifySession()
  if (!session) redirect('/login')

  const blocks = await getDayBlocks(session.userId, todayStr())

  return <FocusView blocks={blocks} />
}
```

**Tests:** ninguno — composición trivial de piezas ya cubiertas (auth pattern replicado
idéntico al resto del repo, `getDayBlocks` ya probado indirectamente en su uso productivo).

**Verificación:**
- [ ] `npx tsc --noEmit` sin errores nuevos
- [ ] Navegar a `http://localhost:3010/focus` autenticado → carga sin sidebar, fondo oscuro

---

### Tarea 12: Botón de entrada en `DiaBoard.tsx`

**Objetivo:** Agregar "🎯 Modo Focus" junto a Pausar/Terminar/Cancelar en la hero card de la
actividad en curso — el único cambio a código ya existente en todo el plan.

**Archivos a modificar:**
- `src/app/(app)/dia/DiaBoard.tsx` — dentro del bloque `isRunning` de la hero card (línea
  ~680-703), agregar un `Link` a `/focus` junto al botón "❚❚ Pausar".

**Implementación:**
```diff
             <button
               disabled={pending}
               onClick={() => startTransition(() => void stopTimerAction())}
               className="rounded-md bg-white/15 px-3 py-1.5 text-sm font-bold text-white hover:bg-white/25"
             >
               ❚❚ Pausar
             </button>
+            <Link
+              href="/focus"
+              className="rounded-md bg-[#e8b94a] px-3 py-1.5 text-sm font-bold text-[#4a3a10] hover:bg-[#dcae3e]"
+            >
+              🎯 Modo Focus
+            </Link>
             <button
               disabled={pending}
               onClick={() => startTransition(() => void markTaskDoneAction(current.taskId!))}
               className="rounded-md bg-[#15803d] px-3 py-1.5 text-sm font-bold text-white hover:bg-[#12692f]"
             >
               ✓ Terminar
             </button>
```
`Link` de `next/link` ya está importado en este archivo (línea 4).

**Tests:** ninguno — un link nuevo en JSX existente.

**Verificación:**
- [ ] `npx tsc --noEmit` sin errores nuevos
- [ ] Visual: el botón aparece solo cuando hay un timer corriendo, junto a Pausar/Terminar

---

## Verificación manual final (navegador, cubre lo no testeable arriba)

1. `preview_start` con `wtw-app-dev`, entrar a `/dia`, iniciar el timer de una actividad.
2. Click en "🎯 Modo Focus" → llega a `/focus` sin sidebar, fondo oscuro, timer coincide con
   el de `/dia`.
3. Reloj 24h visible y corriendo; fecha correcta debajo.
4. Marcar un DoD item → se refleja al volver a `/dia`.
5. Si hay una junta bloqueante próxima, aparece; a 5 min o menos se resalta en dorado.
6. Recargar la página dentro de `/focus` → el timer NO se reinicia (viene de `TimeEntry.startedAt`).
7. Click "✓ Terminar" antes del `fin` planeado del bloque → aparece el modal; "Esperar su
   horario" no arranca nada; "Iniciar ahora" arranca el siguiente timer.
8. `Esc` o el botón ✕ regresan a `/dia`.
9. Sin timer corriendo, `/focus` muestra el estado vacío sin crashear.
10. Confirmar `npx vitest run tests/focus-selectors.test.ts` en verde y `npx tsc --noEmit`
    limpio antes de dar por cerrada la feature.
