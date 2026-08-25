'use client'

import { useActionState } from 'react'
import { login } from './actions'

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, undefined)

  return (
    <main className="min-h-dvh flex items-center justify-center bg-paper px-4">
      <form action={formAction} className="w-full max-w-sm space-y-4 rounded-lg border border-edge bg-surface p-8">
        <div>
          <h1 className="text-2xl font-semibold text-ink">WTW App</h1>
          <p className="text-sm text-muted">Tu semana, ganada por diseño</p>
        </div>
        <label className="block">
          <span className="text-sm font-medium text-muted">Correo</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-md border border-hair px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-muted">Contraseña</span>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-md border border-hair px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </label>
        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50"
        >
          {pending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
