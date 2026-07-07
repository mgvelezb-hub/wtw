'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import type { DayBlockView, PendienteView } from './service'
import {
  startTimerAction,
  stopTimerAction,
  toggleDodItemAction,
  markTaskDoneAction,
  undoTaskDoneAction,
  markBlockDoneAction,
  undoBlockDoneAction,
} from './actions'
import { createManualEntryAction } from './timeentry-actions'

type Win = { posicion: number; titulo: string; estatus: string }
type DiaTab = { fecha: string; abr: string; num: string }

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
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#0d6d63]">
          Semana ISO {p.isoWeek.split('-W')[1]} · Jornada 09–18
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-[#0c4a45]">{p.rango}</h1>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-[#d3e4e0] px-3 py-1 text-xs font-medium text-[#0c4a45]">
              Factor realismo {p.factorUsado.toFixed(1)}
            </span>
            {p.desbloqueador && (
              <span className="rounded-full bg-[#e8b94a] px-3 py-1 text-xs font-semibold text-[#4a3a10]">
                ⚡ {p.desbloqueador}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#0c4a45]">🏆 Wins de la semana</h2>
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
                <span className={w.estatus === 'logrado' ? 'text-neutral-400 line-through' : 'text-neutral-700'}>
                  {w.titulo}
                </span>
              </li>
            ))}
            {p.wins.length === 0 && <li className="text-sm text-neutral-400">Sin Wins definidos.</li>}
          </ol>
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#0c4a45]">📐 Capacidad</h2>
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
              className={`flex shrink-0 flex-col items-center rounded-lg border px-4 py-2 text-sm ${
                active ? 'border-[#0c4a45] bg-[#0c4a45] text-white' : 'border-neutral-200 bg-white text-neutral-600'
              }`}
            >
              <span className="font-semibold">{t.abr}</span>
              <span className="text-xs opacity-80">{t.num}</span>
            </Link>
          )
        })}
      </div>

      {!esHoy && (
        <div className="rounded-lg border-l-4 border-[#e8b94a] bg-[#0c4a45] px-4 py-3 text-sm text-white">
          <span className="text-xs font-semibold uppercase tracking-wide text-[#e8b94a]">Vista de planeación</span>
          <p className="mt-0.5">
            Estás viendo <strong>{p.selectedLabel}</strong>. El cronómetro en vivo funciona en el día de{' '}
            <strong className="text-[#e8b94a]">hoy</strong>.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-3">
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
              className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
            >
              🚚 ICS
            </a>
          </div>

          {activos.map((b) => (
            <BlockCard key={b.id} block={b} tick={tick} pending={pending} startTransition={startTransition} enVivo={esHoy} />
          ))}

          {completados.length > 0 && (
            <div className="space-y-2 opacity-60">
              <h3 className="text-xs font-semibold uppercase text-neutral-500">Completados</h3>
              {completados.map((b) => (
                <BlockCard
                  key={b.id}
                  block={b}
                  tick={tick}
                  pending={pending}
                  startTransition={startTransition}
                  enVivo={esHoy}
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
              <p className="text-xs font-semibold uppercase tracking-wide text-[#9fd0c8]">Capacidad de hoy</p>
              <p className={`mt-1 text-3xl font-bold ${p.capacidadHoy < 0 ? 'text-[#e8b94a]' : 'text-white'}`}>
                {p.capacidadHoy.toFixed(1)} h
              </p>
              <p className="text-xs text-[#9fd0c8]">libres de ~{p.libresHoy.toFixed(0)} h</p>
              {p.capacidadHoy < 0 && (
                <p className="mt-2 text-xs text-[#e8b94a]">
                  ⚠️ Sobrecargado {Math.abs(p.capacidadHoy).toFixed(1)} h — quita algo o muévelo a otro día.
                </p>
              )}
            </div>
          )}

          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-[#0c4a45]">
              📥 Pendientes urgentes <span className="text-neutral-400">({p.pendientes.length})</span>
            </h3>
            <div className="space-y-2">
              {p.pendientes.slice(0, 12).map((pe) => (
                <div
                  key={pe.id}
                  className={`rounded-lg border bg-white p-2.5 text-sm shadow-sm ${
                    pe.urgente ? 'border-neutral-200 border-l-4 border-l-red-400' : 'border-neutral-200'
                  }`}
                >
                  <p className="text-neutral-800">
                    {pe.urgente && <span className="text-red-500">★ </span>}
                    {pe.titulo}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    {pe.estimadoMin != null && (
                      <span className="rounded bg-[#e8b94a]/30 px-1.5 py-0.5 text-[#4a3a10]">{horas(pe.estimadoMin)}</span>
                    )}
                    {pe.proyecto && <span className="text-neutral-400">{pe.proyecto}</span>}
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
      <p className="text-[10px] uppercase tracking-wide text-neutral-400">{l}</p>
    </div>
  )
}

function BlockCard({
  block: b,
  tick,
  pending,
  startTransition,
  enVivo,
}: {
  block: DayBlockView
  tick: number | null
  pending: boolean
  startTransition: (fn: () => void) => void
  enVivo: boolean
}) {
  const isTarea = b.tipo === 'tarea'
  const seconds = isTarea ? liveSeconds(b, tick) : 0
  const over = isTarea && seconds > b.planMin * 60

  if (b.externa) {
    return (
      <div className="rounded-lg border border-neutral-200 border-l-4 border-l-[#0d6d63] bg-[#eef4f3] p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-neutral-500">
              {b.inicio}–{b.fin}
            </p>
            <p className="font-medium text-neutral-800">📅 {b.titulo}</p>
          </div>
          <span className="text-[10px] uppercase tracking-wide text-neutral-400">Outlook</span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-neutral-500">
            {b.inicio}–{b.fin}
          </p>
          <p className="font-medium text-neutral-900">{b.titulo}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isTarea && (
            <span className={`font-mono text-sm ${over ? 'text-red-600' : 'text-[#15803d]'}`}>
              {fmt(seconds)}
              <span className="text-xs text-neutral-400"> / {b.planMin}m</span>
            </span>
          )}
          {isTarea && !b.done && enVivo && (
            <button
              disabled={pending}
              onClick={() =>
                startTransition(() => void (b.runningSince ? stopTimerAction() : startTimerAction(b.taskId!)))
              }
              className="rounded-md bg-[#e8b94a] px-3 py-1.5 text-sm font-semibold text-[#4a3a10] hover:bg-[#dcae3e]"
            >
              {b.runningSince ? '⏸ Pausar' : '▶ Iniciar'}
            </button>
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
            className="rounded-md bg-neutral-100 px-2.5 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-200"
          >
            {b.done ? '↺' : '✓'}
          </button>
        </div>
      </div>

      {(b.proyecto || b.winPosicion || b.aliado || b.gerente) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {b.proyecto && (
            <span
              className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase"
              style={{ borderColor: b.proyecto.color, color: b.proyecto.color }}
            >
              {b.proyecto.nombre}
            </span>
          )}
          {b.winPosicion && (
            <span className="rounded-full bg-[#e8b94a] px-2 py-0.5 text-[10px] font-semibold uppercase text-[#4a3a10]">
              Win {b.winPosicion}
            </span>
          )}
          {b.aliado && (
            <span className="rounded-full bg-[#15803d] px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
              Valor cliente
            </span>
          )}
          {b.gerente && (
            <span className="rounded-full bg-[#5b4b8a] px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
              → Gerente
            </span>
          )}
          {b.proyecto?.tipo === 'interno' && !b.aliado && (
            <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-neutral-600">
              Interno
            </span>
          )}
        </div>
      )}

      {isTarea && (
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
              <span className={d.done ? 'text-neutral-400 line-through' : 'text-neutral-700'}>{d.texto}</span>
            </li>
          ))}
        </ul>
      )}

      {isTarea && enVivo && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const min = window.prompt('¿Cuántos minutos agregar manualmente?')
            const n = min ? Number(min) : NaN
            if (!Number.isNaN(n) && n > 0) startTransition(() => void createManualEntryAction(b.taskId!, n))
          }}
          className="mt-2 text-[10px] font-medium text-neutral-400 hover:text-neutral-600"
        >
          ✎ agregar tiempo manual
        </button>
      )}
    </div>
  )
}
