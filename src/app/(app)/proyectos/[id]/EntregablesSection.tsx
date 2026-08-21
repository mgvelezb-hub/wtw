'use client'

import { useState, useTransition } from 'react'
import { CampoEnLinea } from '@/components/inline-controls'
import { marcarPresentadoAction, registrarImpactoAction } from './actions'

export type ImpactoView = {
  id: string
  fecha: string
  baseline: string
  delta: string
  validadoPor: string | null
  nota: string | null
}

export type EntregableView = {
  id: string
  nombre: string
  avancePct: number
  presentado: boolean
  presentadoA: string | null
  semaforo: 'a_tiempo' | 'atrasado'
  impactos: ImpactoView[]
}

// Form inline de 3 campos para registrar un impacto — sin modal. Colapsado
// detrás del botón "+ Impacto"; baseline y delta son requeridos, validado por
// es opcional. Se cierra solo tras guardar con éxito.
function ImpactoForm({
  disabled,
  onSubmit,
  onCancel,
}: {
  disabled: boolean
  onSubmit: (data: { baseline: string; delta: string; validadoPor?: string }) => void
  onCancel: () => void
}) {
  const [baseline, setBaseline] = useState('')
  const [delta, setDelta] = useState('')
  const [validadoPor, setValidadoPor] = useState('')
  const valido = baseline.trim() !== '' && delta.trim() !== ''

  function guardar() {
    if (!valido) return
    onSubmit({ baseline: baseline.trim(), delta: delta.trim(), validadoPor: validadoPor.trim() || undefined })
  }

  return (
    <div className="mt-2 space-y-1.5 rounded-md border border-neutral-200 bg-neutral-50 p-2">
      <input
        autoFocus
        value={baseline}
        onChange={(e) => setBaseline(e.target.value)}
        disabled={disabled}
        placeholder="Baseline (ej. fill rate 71%)"
        aria-label="Baseline"
        className="w-full rounded border border-neutral-300 px-1.5 py-1 text-xs text-neutral-900"
      />
      <input
        value={delta}
        onChange={(e) => setDelta(e.target.value)}
        disabled={disabled}
        placeholder="Delta (ej. → 78.4%, +$12 MM anualizados)"
        aria-label="Delta"
        className="w-full rounded border border-neutral-300 px-1.5 py-1 text-xs text-neutral-900"
      />
      <input
        value={validadoPor}
        onChange={(e) => setValidadoPor(e.target.value)}
        disabled={disabled}
        placeholder="Validó (opcional)"
        aria-label="Validado por"
        className="w-full rounded border border-neutral-300 px-1.5 py-1 text-xs text-neutral-900"
      />
      <p className="text-[10px] text-neutral-400">Baseline → delta medido. Esto arma la renovación y tu caso de Gerente.</p>
      <div className="flex justify-end gap-2">
        <button
          disabled={disabled}
          onClick={onCancel}
          className="text-xs font-medium text-neutral-400 hover:text-[#b43232]"
        >
          Cancelar
        </button>
        <button
          disabled={disabled || !valido}
          onClick={guardar}
          className="rounded bg-brand px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          Guardar
        </button>
      </div>
    </div>
  )
}

function ImpactoSection({ entregableId, projectId, impactos: impactosIniciales }: { entregableId: string; projectId: string; impactos: ImpactoView[] }) {
  const [impactos, setImpactos] = useState(impactosIniciales)
  const [formAbierto, setFormAbierto] = useState(false)
  const [pending, startTransition] = useTransition()

  function registrar(data: { baseline: string; delta: string; validadoPor?: string }) {
    startTransition(async () => {
      await registrarImpactoAction(projectId, entregableId, data)
      setImpactos((prev) => [
        { id: `tmp-${Date.now()}`, fecha: new Date().toISOString().slice(0, 10), validadoPor: data.validadoPor ?? null, nota: null, ...data },
        ...prev,
      ])
      setFormAbierto(false)
    })
  }

  return (
    <div className={impactos.length > 0 || formAbierto ? 'mt-2 border-t border-neutral-100 pt-2' : 'mt-1'}>
      {impactos.length > 0 && (
        <ul className="space-y-1">
          {impactos.map((imp) => (
            <li key={imp.id} className="text-xs text-neutral-700">
              <span className="font-medium">{imp.baseline}</span> {imp.delta}
              {imp.validadoPor && <span className="text-neutral-400"> · validó {imp.validadoPor}</span>}
            </li>
          ))}
        </ul>
      )}
      {formAbierto ? (
        <ImpactoForm disabled={pending} onSubmit={registrar} onCancel={() => setFormAbierto(false)} />
      ) : (
        <button
          onClick={() => setFormAbierto(true)}
          className="mt-1 text-[10px] font-semibold text-neutral-400 hover:text-brand"
        >
          + Impacto
        </button>
      )}
    </div>
  )
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
        <span className={ent.semaforo === 'atrasado' ? 'text-danger' : 'text-ok'}>
          {ent.semaforo === 'atrasado' ? '🔴 Atrasado' : '🟢 A tiempo'}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
        <div className="h-full bg-brand" style={{ width: `${ent.avancePct}%` }} />
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-neutral-500">
        <span>{ent.avancePct}% avance</span>
        <span className="flex items-center gap-1">
          {ent.presentado ? (
            <button
              disabled={pending}
              onClick={() => togglePresentado()}
              className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand disabled:opacity-50"
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
              className="rounded-full border border-neutral-200 px-2 py-0.5 text-[10px] font-semibold text-neutral-500 hover:border-brand hover:text-brand disabled:opacity-50"
            />
          )}
        </span>
      </div>
      <ImpactoSection entregableId={ent.id} projectId={projectId} impactos={ent.impactos} />
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
