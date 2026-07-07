'use client'

import { useActionState } from 'react'
import { login } from './actions'

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, undefined)

  return (
    <main className="min-h-dvh flex items-center justify-center bg-neutral-50 px-4">
      <form action={formAction} className="w-full max-w-sm space-y-4 rounded-xl bg-white p-8 shadow">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">WTW App</h1>
          <p className="text-sm text-neutral-500">Tu semana, ganada por diseño</p>
        </div>
        <label className="block">
          <span className="text-sm font-medium text-neutral-700">Correo</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A7C82]"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-neutral-700">Contraseña</span>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A7C82]"
          />
        </label>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-[#0A7C82] px-4 py-2 text-sm font-semibold text-white hover:bg-[#086a6f] disabled:opacity-50"
        >
          {pending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
