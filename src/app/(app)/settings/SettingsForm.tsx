'use client'

import { useActionState } from 'react'
import { updateSettings, logoutAction } from './actions'

// Shape plano y serializable — nunca pasar el modelo User de Prisma completo
// a un Client Component: expondría passwordHash/apiTokenHash al cliente y
// factorManual (Decimal) no es serializable a través del límite RSC.
export type SettingsUser = {
  horarioInicio: string
  horarioFin: string
  comidaInicio: string
  comidaFin: string
  bufferPct: number
  factorManual: number | null
  icsUrl: string | null
}

export function SettingsForm({ user }: { user: SettingsUser }) {
  const [state, formAction, pending] = useActionState(updateSettings, undefined)

  return (
    <form action={formAction} className="mx-auto max-w-md space-y-6 p-4">
      <h1 className="text-2xl font-semibold text-ink">Ajustes</h1>

      <div className="space-y-4 rounded-lg border border-edge bg-surface p-6">
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-muted">Horario inicio</span>
            <input name="horarioInicio" defaultValue={user.horarioInicio} className="num mt-1 w-full rounded-md border border-hair px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-muted">Horario fin</span>
            <input name="horarioFin" defaultValue={user.horarioFin} className="num mt-1 w-full rounded-md border border-hair px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-muted">Comida inicio</span>
            <input name="comidaInicio" defaultValue={user.comidaInicio} className="num mt-1 w-full rounded-md border border-hair px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-muted">Comida fin</span>
            <input name="comidaFin" defaultValue={user.comidaFin} className="num mt-1 w-full rounded-md border border-hair px-3 py-2" />
          </label>
        </div>

        <label className="block text-sm">
          <span className="text-muted">Buffer %</span>
          <input name="bufferPct" type="number" defaultValue={user.bufferPct} className="num mt-1 w-full rounded-md border border-hair px-3 py-2" />
        </label>

        <label className="block text-sm">
          <span className="text-muted">Factor de realismo manual</span>
          <input
            name="factorManual"
            type="number"
            step="0.01"
            defaultValue={user.factorManual ?? ''}
            className="num mt-1 w-full rounded-md border border-hair px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="text-muted">URL del calendario (.ics)</span>
          <input name="icsUrl" defaultValue={user.icsUrl ?? ''} className="mt-1 w-full rounded-md border border-hair px-3 py-2" />
        </label>

        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        {state?.success && <p className="text-sm text-ok">Guardado.</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50"
        >
          {pending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>

      <button
        type="submit"
        formAction={logoutAction}
        className="w-full rounded-md border border-edge bg-surface px-4 py-2 text-sm font-medium text-brand-deep hover:bg-paper"
      >
        Cerrar sesión
      </button>
    </form>
  )
}
