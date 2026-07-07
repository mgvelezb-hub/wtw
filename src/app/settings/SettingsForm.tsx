'use client'

import { useActionState } from 'react'
import { updateSettings } from './actions'
import type { User } from '@prisma/client'

export function SettingsForm({ user }: { user: User }) {
  const [state, formAction, pending] = useActionState(updateSettings, undefined)

  return (
    <form action={formAction} className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="text-lg font-bold text-neutral-900">Ajustes</h1>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-neutral-700">Horario inicio</span>
          <input name="horarioInicio" defaultValue={user.horarioInicio} className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="text-neutral-700">Horario fin</span>
          <input name="horarioFin" defaultValue={user.horarioFin} className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="text-neutral-700">Comida inicio</span>
          <input name="comidaInicio" defaultValue={user.comidaInicio} className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="text-neutral-700">Comida fin</span>
          <input name="comidaFin" defaultValue={user.comidaFin} className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2" />
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-neutral-700">Buffer %</span>
        <input name="bufferPct" type="number" defaultValue={user.bufferPct} className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2" />
      </label>

      <label className="block text-sm">
        <span className="text-neutral-700">Factor de realismo manual</span>
        <input
          name="factorManual"
          type="number"
          step="0.01"
          defaultValue={user.factorManual ? Number(user.factorManual) : ''}
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2"
        />
      </label>

      <label className="block text-sm">
        <span className="text-neutral-700">URL del calendario (.ics)</span>
        <input name="icsUrl" defaultValue={user.icsUrl ?? ''} className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2" />
      </label>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-600">Guardado.</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-[#0A7C82] px-4 py-2 text-sm font-semibold text-white hover:bg-[#086a6f] disabled:opacity-50"
      >
        {pending ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  )
}
