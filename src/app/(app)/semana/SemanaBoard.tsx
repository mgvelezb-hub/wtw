'use client'

import { useTransition } from 'react'
import { toggleWinAction } from './actions'

type Win = { id: string; posicion: number; titulo: string; dod: string | null; estatus: string }
type Block = { id: string; fecha: Date; inicio: string; fin: string; tipo: string; titulo: string; planMin: number }

export function SemanaBoard({
  wins,
  blocks,
  cargaHoras,
  trabajableTotal,
  trabajablePlaneable,
}: {
  wins: Win[]
  blocks: Block[]
  cargaHoras: number
  trabajableTotal: number
  trabajablePlaneable: number
}) {
  const [pending, startTransition] = useTransition()

  const porDia = blocks.reduce<Record<string, Block[]>>((acc, b) => {
    const key = new Date(b.fecha).toISOString().slice(0, 10)
    ;(acc[key] ??= []).push(b)
    return acc
  }, {})

  const pct = trabajableTotal > 0 ? Math.min(100, (cargaHoras / trabajableTotal) * 100) : 0

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase text-neutral-500">Wins de la semana</h2>
        <div className="space-y-2">
          {wins.map((w) => (
            <div key={w.id} className="flex items-start justify-between rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
              <div>
                <p className={`font-medium ${w.estatus === 'logrado' ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>
                  {w.posicion}. {w.titulo}
                </p>
                {w.dod && <p className="text-xs text-neutral-500">DoD: {w.dod}</p>}
              </div>
              <button
                disabled={pending}
                onClick={() => startTransition(() => void toggleWinAction(w.id))}
                className="shrink-0 rounded-md bg-neutral-100 px-3 py-1.5 text-sm font-medium hover:bg-neutral-200"
              >
                {w.estatus === 'logrado' ? '↺' : '✓'}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase text-neutral-500">Capacidad</h2>
        <div className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
          <div className="flex justify-between text-sm text-neutral-700">
            <span>Carga: {cargaHoras.toFixed(1)}h</span>
            <span>Planeable: {trabajablePlaneable.toFixed(1)}h</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className={`h-full ${cargaHoras > trabajablePlaneable ? 'bg-red-500' : 'bg-[#0A7C82]'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase text-neutral-500">Bloques por día</h2>
        <div className="space-y-3">
          {Object.entries(porDia).map(([fecha, dayBlocks]) => (
            <div key={fecha}>
              <p className="mb-1 text-xs font-semibold text-neutral-600">{fecha}</p>
              <div className="space-y-1">
                {dayBlocks.map((b) => (
                  <div key={b.id} className="flex justify-between rounded-md bg-white px-3 py-1.5 text-sm shadow-sm">
                    <span className="text-neutral-500">
                      {b.inicio}–{b.fin}
                    </span>
                    <span className="text-neutral-900">{b.titulo}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
