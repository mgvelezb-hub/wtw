'use client'

import { useEffect, useState, useTransition } from 'react'
import type { DayBlockView } from './service'
import { pickCurrentBlock } from '@/lib/day-logic'
import {
  startTimerAction,
  stopTimerAction,
  toggleDodItemAction,
  markTaskDoneAction,
  undoTaskDoneAction,
  markBlockDoneAction,
  undoBlockDoneAction,
} from './actions'

function fmt(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.floor(totalSeconds % 60)
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

function nowHHMM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function liveSeconds(b: DayBlockView, tickMs: number): number {
  if (!b.runningSince) return b.accumulatedSeconds
  return b.accumulatedSeconds + (tickMs - new Date(b.runningSince).getTime()) / 1000
}

export function DiaBoard({ blocks }: { blocks: DayBlockView[] }) {
  const [tick, setTick] = useState(() => Date.now())
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const activos = blocks.filter((b) => !b.done)
  const completados = blocks.filter((b) => b.done)
  const pick = pickCurrentBlock(activos, nowHHMM())

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <div className="rounded-lg bg-[#0A7C82] px-4 py-3 text-white">
        {pick.kind === 'current' && (
          <p className="text-sm">
            Ahora: <strong>{pick.block.titulo ?? ''}</strong>
          </p>
        )}
        {pick.kind === 'next' && (
          <p className="text-sm">
            Siguiente: <strong>{pick.block.titulo ?? ''}</strong> ({pick.block.inicio})
          </p>
        )}
        {pick.kind === 'none' && <p className="text-sm">No hay más bloques pendientes hoy.</p>}
      </div>

      <section className="space-y-3">
        {activos.map((b) => (
          <BlockCard key={b.id} block={b} tick={tick} pending={pending} startTransition={startTransition} />
        ))}
      </section>

      {completados.length > 0 && (
        <section className="space-y-2 opacity-60">
          <h2 className="text-xs font-semibold uppercase text-neutral-500">Completados</h2>
          {completados.map((b) => (
            <BlockCard key={b.id} block={b} tick={tick} pending={pending} startTransition={startTransition} />
          ))}
        </section>
      )}
    </div>
  )
}

function BlockCard({
  block: b,
  tick,
  pending,
  startTransition,
}: {
  block: DayBlockView
  tick: number
  pending: boolean
  startTransition: (fn: () => void) => void
}) {
  const isTarea = b.tipo === 'tarea'
  const seconds = isTarea ? liveSeconds(b, tick) : 0
  const pct = isTarea ? Math.min(100, (seconds / (b.planMin * 60)) * 100) : 0
  const over = isTarea && seconds > b.planMin * 60

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-neutral-500">
            {b.inicio}–{b.fin}
          </p>
          <p className="font-medium text-neutral-900">{b.titulo}</p>
        </div>
        <div className="flex gap-2">
          {isTarea && !b.done && (
            <button
              disabled={pending}
              onClick={() =>
                startTransition(() => void (b.runningSince ? stopTimerAction() : startTimerAction(b.taskId!)))
              }
              className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm font-medium hover:bg-neutral-200"
            >
              {b.runningSince ? '⏸' : '▶'}
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
            className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm font-medium hover:bg-neutral-200"
          >
            {b.done ? '↺' : '✓'}
          </button>
        </div>
      </div>

      {isTarea && (
        <>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
            <div className={`h-full ${over ? 'bg-red-500' : 'bg-[#0A7C82]'}`} style={{ width: `${pct}%` }} />
          </div>
          <p className={`mt-1 text-xs ${over ? 'text-red-600' : 'text-neutral-500'}`}>{fmt(seconds)}</p>
        </>
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
    </div>
  )
}
