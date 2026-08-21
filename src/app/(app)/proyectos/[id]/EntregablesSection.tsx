'use client'

import { useState, useTransition } from 'react'
import { CampoEnLinea } from '@/components/inline-controls'
import { marcarPresentadoAction } from './actions'

export type EntregableView = {
  id: string
  nombre: string
  avancePct: number
  presentado: boolean
  presentadoA: string | null
  semaforo: 'a_tiempo' | 'atrasado'
}

function EntregableRow({ entregable, projectId }: { entregable: EntregableView; projectId: string }) {
  const [ent, setEnt] = useState(entregable)
  const [pending, startTransition] = useTransition()

  function togglePresentado(presentadoA?: string) {
    const siguiente = !ent.presentado
    setEnt((prev) => ({ ...prev, presentado: siguiente, presentadoA: siguiente ? (presentadoA ?? prev.presentadoA) : null }))
    startTransition(async () => {
      await marcarPresentadoAction(projectId, ent.id, siguiente, presentadoA)
    })
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium text-neutral-900">{ent.nombre}</span>
        <span className={ent.semaforo === 'atrasado' ? 'text-red-600' : 'text-green-600'}>
          {ent.semaforo === 'atrasado' ? '🔴 Atrasado' : '🟢 A tiempo'}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
        <div className="h-full bg-[#0A7C82]" style={{ width: `${ent.avancePct}%` }} />
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-neutral-500">
        <span>{ent.avancePct}% avance</span>
        <span className="flex items-center gap-1">
          {ent.presentado ? (
            <button
              disabled={pending}
              onClick={() => togglePresentado()}
              className="rounded-full bg-[#0A7C82]/10 px-2 py-0.5 text-[10px] font-semibold text-[#0A7C82] disabled:opacity-50"
              title="Desmarcar presentado"
            >
              ✓ Presentado{ent.presentadoA ? ` — ${ent.presentadoA}` : ''}
            </button>
          ) : (
            <CampoEnLinea
              icono="Marcar presentado"
              titulo="Marcar como presentado en persona"
              placeholder="¿Ante quién? (opcional)"
              ancho="w-32"
              disabled={pending}
              // Nunca devuelve null: "¿ante quién?" es opcional, así que vacío
              // también es válido y el ✓ queda siempre habilitado.
              parse={(raw) => raw.trim()}
              onSubmit={(valor) => togglePresentado(typeof valor === 'string' && valor !== '' ? valor : undefined)}
              className="rounded-full border border-neutral-200 px-2 py-0.5 text-[10px] font-semibold text-neutral-500 hover:border-[#0A7C82] hover:text-[#0A7C82] disabled:opacity-50"
            />
          )}
        </span>
      </div>
    </div>
  )
}

export function EntregablesSection({ entregables, projectId }: { entregables: EntregableView[]; projectId: string }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase text-neutral-500">Entregables</h2>
      <div className="space-y-2">
        {entregables.map((ent) => (
          <EntregableRow key={ent.id} entregable={ent} projectId={projectId} />
        ))}
        {entregables.length === 0 && <p className="text-sm text-neutral-400">Sin entregables registrados.</p>}
      </div>
    </section>
  )
}
