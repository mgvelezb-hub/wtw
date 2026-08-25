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
    <div className="mt-2 space-y-1.5 rounded-lg border border-edge bg-surface p-2">
      <input
        autoFocus
        value={baseline}
        onChange={(e) => setBaseline(e.target.value)}
        disabled={disabled}
        placeholder="Baseline (ej. fill rate 71%)"
        aria-label="Baseline"
        className="w-full rounded border border-hair px-1.5 py-1 text-xs text-ink"
      />
      <input
        value={delta}
        onChange={(e) => setDelta(e.target.value)}
        disabled={disabled}
        placeholder="Delta (ej. → 78.4%, +$12 MM anualizados)"
        aria-label="Delta"
        className="w-full rounded border border-hair px-1.5 py-1 text-xs text-ink"
      />
      <input
        value={validadoPor}
        onChange={(e) => setValidadoPor(e.target.value)}
        disabled={disabled}
        placeholder="Validó (opcional)"
        aria-label="Validado por"
        className="w-full rounded border border-hair px-1.5 py-1 text-xs text-ink"
      />
      <p className="text-[10px] text-faint">Baseline → delta medido. Esto arma la renovación y tu caso de Gerente.</p>
      <div className="flex justify-end gap-2">
        <button
          disabled={disabled}
          onClick={onCancel}
          className="text-xs font-medium text-faint hover:text-danger"
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
    <div className={impactos.length > 0 || formAbierto ? 'hair mt-2 pt-2' : 'mt-1'}>
      {impactos.length > 0 && (
        <ul className="space-y-1">
          {impactos.map((imp) => (
            <li key={imp.id} className="text-xs text-ink">
              <span className="font-medium">{imp.baseline}</span> {imp.delta}
              {imp.validadoPor && <span className="text-faint"> · validó {imp.validadoPor}</span>}
            </li>
          ))}
        </ul>
      )}
      {formAbierto ? (
        <ImpactoForm disabled={pending} onSubmit={registrar} onCancel={() => setFormAbierto(false)} />
      ) : (
        <button
          onClick={() => setFormAbierto(true)}
          className="mt-1 text-[10px] font-semibold text-faint hover:text-brand"
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
    <div className="py-3">
      <div className="grid grid-cols-[1fr_60px_90px] items-center gap-3">
        <span className="font-medium text-ink">{ent.nombre}</span>
        <span className="num text-right text-sm text-muted">{ent.avancePct}%</span>
        <span
          className={`text-right text-xs font-semibold ${ent.semaforo === 'atrasado' ? 'text-danger' : 'text-ok'}`}
        >
          {ent.semaforo === 'atrasado' ? 'Atrasado' : 'A tiempo'}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-hair">
        <div className="h-full bg-brand" style={{ width: `${ent.avancePct}%` }} />
      </div>
      <div className="mt-1 flex items-center justify-end">
        {ent.presentado ? (
          <button
            disabled={pending}
            onClick={() => togglePresentado()}
            className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand-deep disabled:opacity-50"
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
            className="rounded-full border border-hair px-2 py-0.5 text-[10px] font-semibold text-muted hover:border-brand hover:text-brand disabled:opacity-50"
          />
        )}
      </div>
      <ImpactoSection entregableId={ent.id} projectId={projectId} impactos={ent.impactos} />
    </div>
  )
}

export function EntregablesSection({ entregables, projectId }: { entregables: EntregableView[]; projectId: string }) {
  return (
    <section>
      <h2 className="lbl mb-2">Entregables</h2>
      <div className="divide-y divide-hair">
        {entregables.map((ent) => (
          <EntregableRow key={ent.id} entregable={ent} projectId={projectId} />
        ))}
        {entregables.length === 0 && <p className="text-sm text-faint">Sin entregables registrados.</p>}
      </div>
    </section>
  )
}
