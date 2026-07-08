'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import type { DayBlockView, PendienteView, StrandedBlockView } from './service'
import {
  startTimerAction,
  stopTimerAction,
  cancelTimerAction,
  toggleDodItemAction,
  markTaskDoneAction,
  undoTaskDoneAction,
  markBlockDoneAction,
  undoBlockDoneAction,
} from './actions'
import { createManualEntryAction } from './timeentry-actions'
import { scheduleTaskAction, moveBlockAction, carryToTodayAction, carryAllToTodayAction } from './dnd-actions'

type Win = { posicion: number; titulo: string; estatus: string }
type DiaTab = { fecha: string; abr: string; num: string }
type StartTransitionFn = (fn: () => void) => void

export type DiaBoardProps = {
  isoWeek: string
  rango: string
  factorUsado: number
  desbloqueador: string | null
  wins: Win[]
  trabajable: number
  carga: number
  colchon: number
  pct: number
  tabs: DiaTab[]
  selectedDay: string
  today: string
  selectedLabel: string
  blocks: DayBlockView[]
  planeadoMin: number
  realMin: number
  factorDia: number | null
  libresHoy: number
  capacidadHoy: number
  pendientes: PendienteView[]
  stranded: StrandedBlockView[]
}

function fmt(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.floor(totalSeconds % 60)
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

function horas(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m === 0 ? `${h}H` : `${h}H${String(m).padStart(2, '0')}`
}

function liveSeconds(b: DayBlockView, tickMs: number | null): number {
  if (tickMs === null || !b.runningSince) return b.accumulatedSeconds
  return b.accumulatedSeconds + (tickMs - new Date(b.runningSince).getTime()) / 1000
}

function nowHHMM(tickMs: number): string {
  const d = new Date(tickMs)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Pastel de fondo + el color del proyecto como texto — mismo patrón de contraste
// que el tablero original (fill suave + texto saturado, no outline sobre blanco).
function pillStyle(color: string): React.CSSProperties {
  return { backgroundColor: `${color}1f`, borderColor: `${color}55`, color }
}

function ProyectoBadge({ proyecto }: { proyecto: NonNullable<DayBlockView['proyecto']> }) {
  return (
    <span
      className="rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={pillStyle(proyecto.color)}
    >
      {proyecto.nombre}
    </span>
  )
}

export function DiaBoard(p: DiaBoardProps) {
  const [tick, setTick] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    setTick(Date.now())
    const id = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const esHoy = p.selectedDay === p.today
  const activos = p.blocks.filter((b) => !b.done)
  const completados = p.blocks.filter((b) => b.done)

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <RunningHero
        blocks={activos}
        tick={tick}
        esHoy={esHoy}
        selectedLabel={p.selectedLabel}
        pending={pending}
        startTransition={startTransition}
      />

      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#0d6d63]">
          Semana ISO {p.isoWeek.split('-W')[1]} · Jornada 09–18
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-[#0c4a45]">{p.rango}</h1>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-[#d3e4e0] px-3 py-1 text-xs font-semibold text-[#0c4a45]">
              Factor realismo {p.factorUsado.toFixed(1)}
            </span>
            {p.desbloqueador && (
              <span className="rounded-full bg-[#e8b94a] px-3 py-1 text-xs font-bold text-[#4a3a10]">
                ⚡ {p.desbloqueador}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-[#0c4a45]">🏆 Wins de la semana</h2>
          <ol className="space-y-2">
            {p.wins.map((w) => (
              <li key={w.posicion} className="flex gap-2 text-sm">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    w.estatus === 'logrado' ? 'bg-[#15803d] text-white' : 'bg-[#d3e4e0] text-[#0c4a45]'
                  }`}
                >
                  {w.posicion}
                </span>
                <span className={w.estatus === 'logrado' ? 'text-neutral-400 line-through' : 'text-neutral-800'}>
                  {w.titulo}
                </span>
              </li>
            ))}
            {p.wins.length === 0 && <li className="text-sm text-neutral-400">Sin Wins definidos.</li>}
          </ol>
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-[#0c4a45]">📐 Capacidad</h2>
          <div className="flex gap-6">
            <Stat n={p.trabajable.toFixed(0)} u="h" l="Trabajable" />
            <Stat n={p.carga.toFixed(0)} u="h" l="Carga" />
            <Stat n={`${p.colchon >= 0 ? '+' : ''}${p.colchon.toFixed(0)}`} u="h" l="Colchón" accent />
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className={`h-full ${p.pct > 100 ? 'bg-red-500' : 'bg-[#0d6d63]'}`}
              style={{ width: `${Math.min(100, p.pct)}%` }}
            />
          </div>
        </section>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {p.tabs.map((t) => {
          const active = t.fecha === p.selectedDay
          return (
            <Link
              key={t.fecha}
              href={`/dia?dia=${t.fecha}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const data = e.dataTransfer.getData('text/plain')
                if (data.startsWith('block:')) startTransition(() => void moveBlockAction(data.slice(6), t.fecha))
                else if (data.startsWith('pend:')) startTransition(() => void scheduleTaskAction(data.slice(5), t.fecha))
              }}
              className={`flex shrink-0 flex-col items-center rounded-lg border px-4 py-2 text-sm font-medium ${
                active ? 'border-[#0c4a45] bg-[#0c4a45] text-white' : 'border-neutral-200 bg-white text-neutral-700'
              }`}
            >
              <span className="font-bold">{t.abr}</span>
              <span className="text-xs opacity-90">{t.num}</span>
            </Link>
          )
        })}
      </div>

      {esHoy && p.stranded.length > 0 && (
        <div className="rounded-lg border border-[#e8b94a] bg-[#fdf6e3] px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold text-[#7a5a00]">
              ⚠️ Tienes {p.stranded.length} tarea{p.stranded.length > 1 ? 's' : ''} de días anteriores sin terminar.
            </p>
            <button
              disabled={pending}
              onClick={() =>
                startTransition(() => void carryAllToTodayAction(p.stranded.map((s) => s.id), p.today))
              }
              className="rounded-md bg-[#e8b94a] px-3 py-1.5 text-xs font-bold text-[#4a3a10] hover:bg-[#dcae3e]"
            >
              Llevar todo a hoy
            </button>
          </div>
          <ul className="mt-2 space-y-1">
            {p.stranded.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-[#7a5a00]">
                <span>
                  {s.titulo} <span className="text-xs opacity-70">({s.fecha})</span>
                </span>
                <button
                  disabled={pending}
                  onClick={() => startTransition(() => void carryToTodayAction(s.id, p.today))}
                  className="shrink-0 text-xs font-semibold underline hover:no-underline"
                >
                  llevar a hoy
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div
          className="space-y-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const data = e.dataTransfer.getData('text/plain')
            if (data.startsWith('pend:')) {
              e.preventDefault()
              startTransition(() => void scheduleTaskAction(data.slice(5), p.selectedDay))
            }
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm">
            <div className="flex gap-5">
              <span className="text-[#0c4a45]">
                Planeado <strong className="text-[#0d6d63]">{horas(p.planeadoMin)}</strong>
              </span>
              <span className="text-[#0c4a45]">
                Real <strong className="text-[#15803d]">{p.realMin > 0 ? horas(p.realMin) : '0M'}</strong>
              </span>
              <span className="text-[#0c4a45]">
                Factor del día <strong className="text-[#0d6d63]">{p.factorDia ? p.factorDia.toFixed(2) : '—'}</strong>
              </span>
            </div>
            <a
              href="/api/v1/calendar/export"
              className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
            >
              🚚 ICS
            </a>
          </div>

          {activos.map((b) => (
            <BlockCard
              key={b.id}
              block={b}
              tick={tick}
              pending={pending}
              startTransition={startTransition}
              enVivo={esHoy}
              tabs={p.tabs}
              selectedDay={p.selectedDay}
            />
          ))}

          {completados.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase text-neutral-500">
                ✓ Terminadas ({completados.length})
              </h3>
              {completados.map((b) => (
                <BlockCard
                  key={b.id}
                  block={b}
                  tick={tick}
                  pending={pending}
                  startTransition={startTransition}
                  enVivo={esHoy}
                  tabs={p.tabs}
                  selectedDay={p.selectedDay}
                />
              ))}
            </div>
          )}

          {p.blocks.length === 0 && (
            <p className="rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-400">
              Sin bloques este día. Usa <code>/wtw-dia</code> para armarlo.
            </p>
          )}
        </div>

        <div className="space-y-4">
          {esHoy && (
            <div className="rounded-xl bg-[#0c4a45] p-4 text-white shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-[#9fd0c8]">Capacidad de hoy</p>
              <p className={`mt-1 text-3xl font-bold ${p.capacidadHoy < 0 ? 'text-[#e8b94a]' : 'text-white'}`}>
                {p.capacidadHoy.toFixed(1)} h
              </p>
              <p className="text-xs font-medium text-[#c7e4de]">libres de ~{p.libresHoy.toFixed(0)} h</p>
              {p.capacidadHoy < 0 && (
                <p className="mt-2 text-xs font-semibold text-[#e8b94a]">
                  ⚠️ Sobrecargado {Math.abs(p.capacidadHoy).toFixed(1)} h — quita algo o muévelo a otro día.
                </p>
              )}
            </div>
          )}

          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-bold text-[#0c4a45]">
              📥 Pendientes urgentes <span className="text-neutral-400">({p.pendientes.length})</span>
            </h3>
            <div className="max-h-[32rem] space-y-2 overflow-y-auto">
              {p.pendientes.map((pe) => (
                <div
                  key={pe.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', `pend:${pe.id}`)}
                  className={`cursor-grab rounded-lg border bg-white p-2.5 text-sm shadow-sm active:cursor-grabbing ${
                    pe.urgente ? 'border-neutral-200 border-l-4 border-l-red-500' : 'border-neutral-200'
                  }`}
                >
                  <p className="font-medium text-neutral-900">
                    {pe.urgente && <span className="text-red-600">★ </span>}
                    {pe.titulo}
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      {pe.estimadoMin != null && (
                        <span className="rounded bg-[#f5deae] px-1.5 py-0.5 font-semibold text-[#4a3a10]">
                          {horas(pe.estimadoMin)}
                        </span>
                      )}
                      {pe.proyecto && <span className="font-medium text-neutral-500">{pe.proyecto}</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      <select
                        disabled={pending}
                        defaultValue=""
                        onChange={(e) => {
                          const fecha = e.target.value
                          e.target.value = ''
                          if (fecha) startTransition(() => void scheduleTaskAction(pe.id, fecha))
                        }}
                        className="rounded border border-neutral-300 bg-white px-1 py-0.5 text-[10px] font-medium text-neutral-600"
                      >
                        <option value="" disabled>
                          Agendar a…
                        </option>
                        {p.tabs.map((t) => (
                          <option key={t.fecha} value={t.fecha}>
                            {t.abr} {t.num}
                          </option>
                        ))}
                      </select>
                      <button
                        disabled={pending}
                        onClick={() => startTransition(() => void scheduleTaskAction(pe.id, p.today))}
                        className="rounded bg-[#e8b94a] px-2 py-0.5 text-[10px] font-bold text-[#4a3a10] hover:bg-[#dcae3e]"
                      >
                        + Hoy
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {p.pendientes.length === 0 && <p className="text-xs text-neutral-400">Sin pendientes sin agendar.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ n, u, l, accent }: { n: string; u: string; l: string; accent?: boolean }) {
  return (
    <div>
      <p className={`text-2xl font-bold ${accent ? 'text-[#15803d]' : 'text-[#0c4a45]'}`}>
        {n}
        <span className="text-sm font-medium">{u}</span>
      </p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{l}</p>
    </div>
  )
}

// Hero fijo arriba: el bloque "ahora" — con cronómetro grande y controles cuando
// es una tarea en curso. Replica el .hero del tablero original (teal-900, DoD
// inline, Pausar/Terminar/Cancelar), en vez de un timer perdido dentro de la card.
function RunningHero({
  blocks,
  tick,
  esHoy,
  selectedLabel,
  pending,
  startTransition,
}: {
  blocks: DayBlockView[]
  tick: number | null
  esHoy: boolean
  selectedLabel: string
  pending: boolean
  startTransition: StartTransitionFn
}) {
  if (!esHoy) {
    return (
      <div className="sticky top-14 z-10 rounded-xl border-l-4 border-[#e8b94a] bg-[#0c4a45] px-5 py-4 text-white shadow-md md:top-0">
        <p className="text-xs font-bold uppercase tracking-wide text-[#e8b94a]">Vista de planeación</p>
        <p className="mt-1 text-sm">
          Estás viendo <strong>{selectedLabel}</strong>. El cronómetro en vivo funciona en el día de{' '}
          <strong className="text-[#e8b94a]">hoy</strong>.
        </p>
      </div>
    )
  }

  const now = tick !== null ? nowHHMM(tick) : null
  const running = blocks.find((b) => b.runningSince)
  const current =
    running ?? (now ? blocks.find((b) => b.inicio !== 'flex' && b.inicio <= now && now < b.fin) : undefined)

  if (!current) {
    const next = now
      ? blocks
          .filter((b) => b.inicio !== 'flex' && b.inicio > now)
          .sort((a, b) => a.inicio.localeCompare(b.inicio))[0]
      : undefined
    return (
      <div className="sticky top-14 z-10 rounded-xl bg-[#0c4a45] px-5 py-4 text-white shadow-md md:top-0">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[#9fd0c8]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#e8b94a]" /> Sin bloque ahora
        </p>
        <p className="mt-1 text-sm text-white/90">
          {next ? (
            <>
              Siguiente: <strong className="text-white">{next.titulo}</strong> a las {next.inicio}.
            </>
          ) : (
            'Sin más bloques agendados hoy.'
          )}
        </p>
      </div>
    )
  }

  const isTareaCronometrable = current.tipo === 'tarea' && !current.externa
  if (!isTareaCronometrable) {
    return (
      <div className="sticky top-14 z-10 rounded-xl bg-[#0c4a45] px-5 py-4 text-white shadow-md md:top-0">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[#9fd0c8]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#e8b94a]" /> Ahora · {current.inicio}–{current.fin}
        </p>
        <p className="mt-1 text-lg font-bold">
          {current.externa ? '📅 ' : ''}
          {current.titulo}
        </p>
      </div>
    )
  }

  const seconds = liveSeconds(current, tick)
  const over = seconds > current.planMin * 60
  const isRunning = !!current.runningSince

  return (
    <div className="sticky top-14 z-10 rounded-xl bg-[#0c4a45] px-5 py-4 text-white shadow-md md:top-0">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[#9fd0c8]">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[#e8b94a]" />
        {isRunning ? 'En curso' : 'Ahora'} · {current.inicio}–{current.fin}
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold">{current.titulo}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {current.proyecto && <ProyectoBadge proyecto={current.proyecto} />}
            {current.winPosicion && (
              <span className="rounded-full bg-[#e8b94a] px-2 py-0.5 text-[10px] font-bold uppercase text-[#4a3a10]">
                Win {current.winPosicion}
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className={`font-mono text-3xl font-bold tabular-nums ${over ? 'text-[#e8b94a]' : 'text-white'}`}>
            {fmt(seconds)}
          </p>
          <p className="text-xs font-medium text-[#c7e4de]">de {current.planMin}m planeado</p>
        </div>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
        <div
          className={`h-full ${over ? 'bg-[#e8b94a]' : 'bg-[#3fb6a8]'}`}
          style={{ width: `${Math.min(100, (seconds / (current.planMin * 60)) * 100)}%` }}
        />
      </div>
      {current.dodItems.length > 0 && (
        <ul className="mt-3 space-y-1">
          {current.dodItems.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={d.done}
                disabled={pending}
                onChange={() => startTransition(() => void toggleDodItemAction(d.id))}
              />
              <span className={d.done ? 'text-white/50 line-through' : 'text-white/95'}>{d.texto}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {isRunning ? (
          <>
            <button
              disabled={pending}
              onClick={() => startTransition(() => void stopTimerAction())}
              className="rounded-md bg-white/15 px-3 py-1.5 text-sm font-bold text-white hover:bg-white/25"
            >
              ❚❚ Pausar
            </button>
            <button
              disabled={pending}
              onClick={() => startTransition(() => void markTaskDoneAction(current.taskId!))}
              className="rounded-md bg-[#15803d] px-3 py-1.5 text-sm font-bold text-white hover:bg-[#12692f]"
            >
              ✓ Terminar
            </button>
            <button
              disabled={pending}
              onClick={() => startTransition(() => void cancelTimerAction(current.taskId!))}
              className="rounded-md px-3 py-1.5 text-sm font-semibold text-white/70 hover:text-white"
            >
              ✕ Cancelar
            </button>
          </>
        ) : (
          <button
            disabled={pending}
            onClick={() => startTransition(() => void startTimerAction(current.taskId!))}
            className="rounded-md bg-[#e8b94a] px-4 py-1.5 text-sm font-bold text-[#4a3a10] hover:bg-[#dcae3e]"
          >
            ▶ {seconds > 0 ? 'Reanudar' : 'Iniciar'}
          </button>
        )}
      </div>
    </div>
  )
}

function BlockCard({
  block: b,
  tick,
  pending,
  startTransition,
  enVivo,
  tabs,
  selectedDay,
}: {
  block: DayBlockView
  tick: number | null
  pending: boolean
  startTransition: StartTransitionFn
  enVivo: boolean
  tabs: DiaTab[]
  selectedDay: string
}) {
  const isTarea = b.tipo === 'tarea'
  const seconds = isTarea ? liveSeconds(b, tick) : 0
  const over = isTarea && seconds > b.planMin * 60

  if (b.externa) {
    return (
      <div className="rounded-lg border border-neutral-200 border-l-4 border-l-[#0d6d63] bg-[#eef4f3] p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-neutral-600">
              {b.inicio}–{b.fin}
            </p>
            <p className="font-semibold text-neutral-900">📅 {b.titulo}</p>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">Outlook</span>
        </div>
      </div>
    )
  }

  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', `block:${b.id}`)}
      className={`cursor-grab rounded-lg border p-3 shadow-sm active:cursor-grabbing ${
        b.done ? 'border-neutral-200 bg-neutral-50' : 'border-neutral-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-neutral-500">
            {b.inicio === 'flex' ? '⋯ sin hora' : `${b.inicio}–${b.fin}`}
          </p>
          <p className={`font-semibold ${b.done ? 'text-neutral-500 line-through' : 'text-neutral-900'}`}>
            {b.titulo}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isTarea && !b.runningSince && (
            <span className={`font-mono text-sm font-semibold ${over ? 'text-red-600' : 'text-[#15803d]'}`}>
              {fmt(seconds)}
              <span className="text-xs font-medium text-neutral-400"> / {b.planMin}m</span>
            </span>
          )}
          {isTarea && !b.done && !b.runningSince && enVivo && (
            <button
              disabled={pending}
              onClick={() => startTransition(() => void startTimerAction(b.taskId!))}
              className="rounded-md bg-[#e8b94a] px-3 py-1.5 text-sm font-bold text-[#4a3a10] hover:bg-[#dcae3e]"
            >
              ▶ Iniciar
            </button>
          )}
          {isTarea && b.runningSince && (
            <span className="rounded-full bg-[#d3e4e0] px-2 py-1 text-xs font-bold text-[#0c4a45]">
              ⏱ en el hero
            </span>
          )}
          {!b.runningSince && tabs.length > 0 && (
            <select
              disabled={pending}
              defaultValue=""
              onChange={(e) => {
                const fecha = e.target.value
                e.target.value = ''
                if (fecha) startTransition(() => void moveBlockAction(b.id, fecha))
              }}
              className="rounded-md border border-neutral-300 bg-white px-1.5 py-1.5 text-xs font-medium text-neutral-600"
            >
              <option value="" disabled>
                Mover a…
              </option>
              {tabs.filter((t) => t.fecha !== selectedDay).map((t) => (
                <option key={t.fecha} value={t.fecha}>
                  {t.abr} {t.num}
                </option>
              ))}
            </select>
          )}
          <button
            disabled={pending}
            onClick={() =>
              startTransition(() =>
                void (b.done
                  ? isTarea
                    ? undoTaskDoneAction(b.taskId!)
                    : undoBlockDoneAction(b.id)
                  : isTarea
                    ? markTaskDoneAction(b.taskId!)
                    : markBlockDoneAction(b.id))
              )
            }
            className="rounded-md bg-neutral-100 px-2.5 py-1.5 text-sm font-bold text-neutral-700 hover:bg-neutral-200"
          >
            {b.done ? '↺' : '✓'}
          </button>
        </div>
      </div>

      {(b.proyecto || b.winPosicion || b.aliado || b.gerente) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {b.proyecto && <ProyectoBadge proyecto={b.proyecto} />}
          {b.winPosicion && (
            <span className="rounded-full bg-[#e8b94a] px-2 py-0.5 text-[10px] font-bold uppercase text-[#4a3a10]">
              Win {b.winPosicion}
            </span>
          )}
          {b.aliado && (
            <span className="rounded-full bg-[#15803d] px-2 py-0.5 text-[10px] font-bold uppercase text-white">
              Valor cliente
            </span>
          )}
          {b.gerente && (
            <span className="rounded-full bg-[#5b4b8a] px-2 py-0.5 text-[10px] font-bold uppercase text-white">
              → Gerente
            </span>
          )}
          {b.proyecto?.tipo === 'interno' && !b.aliado && (
            <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-bold uppercase text-neutral-700">
              Interno
            </span>
          )}
        </div>
      )}

      {isTarea && !b.runningSince && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
          <div
            className={`h-full ${over ? 'bg-red-500' : 'bg-[#0d6d63]'}`}
            style={{ width: `${Math.min(100, (seconds / (b.planMin * 60)) * 100)}%` }}
          />
        </div>
      )}

      {b.dodItems.length > 0 && (
        <ul className="mt-2 space-y-1">
          {b.dodItems.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={d.done}
                disabled={pending}
                onChange={() => startTransition(() => void toggleDodItemAction(d.id))}
              />
              <span className={d.done ? 'text-neutral-400 line-through' : 'text-neutral-800'}>{d.texto}</span>
            </li>
          ))}
        </ul>
      )}

      {isTarea && enVivo && !b.done && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const min = window.prompt('¿Cuántos minutos agregar manualmente?')
            const n = min ? Number(min) : NaN
            if (!Number.isNaN(n) && n > 0) startTransition(() => void createManualEntryAction(b.taskId!, n))
          }}
          className="mt-2 text-[10px] font-semibold text-neutral-500 hover:text-neutral-700"
        >
          ✎ agregar tiempo manual
        </button>
      )}
    </div>
  )
}
