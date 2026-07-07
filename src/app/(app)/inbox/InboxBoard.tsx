'use client'

import { useRef, useTransition } from 'react'
import type { Task } from '@prisma/client'
import { captureAction, discardAction } from './actions'

export function InboxBoard({ tasks }: { tasks: Task[] }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <h1 className="text-lg font-bold text-neutral-900">Inbox</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const titulo = inputRef.current?.value ?? ''
          if (!titulo.trim()) return
          startTransition(() => void captureAction(titulo))
          if (inputRef.current) inputRef.current.value = ''
        }}
        className="flex gap-2"
      >
        <input
          ref={inputRef}
          type="text"
          placeholder="Captura una idea…"
          disabled={pending}
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A7C82]"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[#0A7C82] px-4 py-2 text-sm font-semibold text-white hover:bg-[#086a6f] disabled:opacity-50"
        >
          Agregar
        </button>
      </form>

      <ul className="space-y-2">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
            <span className="text-sm text-neutral-900">{t.titulo}</span>
            <button
              disabled={pending}
              onClick={() => startTransition(() => void discardAction(t.id))}
              className="text-xs font-medium text-neutral-400 hover:text-red-600"
            >
              Descartar
            </button>
          </li>
        ))}
        {tasks.length === 0 && <p className="text-sm text-neutral-400">Inbox vacío — todo triageado.</p>}
      </ul>
    </div>
  )
}
