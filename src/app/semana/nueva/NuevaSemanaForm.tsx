'use client'

import { useState, useTransition } from 'react'
import { crearSemanaAction, type NuevaSemanaWin, type NuevaSemanaTask } from './actions'

let refCounter = 0
function nextRef(): string {
  refCounter += 1
  return `t${refCounter}`
}

export function NuevaSemanaForm() {
  const [wins, setWins] = useState<NuevaSemanaWin[]>([{ titulo: '', dod: '' }])
  const [tasks, setTasks] = useState<(NuevaSemanaTask & { dodText: string })[]>([
    { ref: nextRef(), titulo: '', projectNombre: '', estimadoHoras: 1, dod: [], dodText: '' },
  ])
  const [pending, startTransition] = useTransition()

  function submit() {
    const winsLimpios = wins.filter((w) => w.titulo.trim())
    const tasksLimpias = tasks
      .filter((t) => t.titulo.trim())
      .map((t) => ({ ...t, dod: t.dodText.split('\n').map((l) => l.trim()).filter(Boolean) }))
    if (winsLimpios.length === 0 || tasksLimpias.length === 0) return
    startTransition(() => void crearSemanaAction(winsLimpios, tasksLimpias))
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <div>
        <h1 className="text-lg font-bold text-neutral-900">Nueva semana</h1>
        <p className="text-sm text-neutral-500">Wins + vaciado — el bloqueo en calendario y pre-empt los ves con tu manager.</p>
      </div>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase text-neutral-500">Wins (máx. 3)</h2>
        <div className="space-y-2">
          {wins.map((w, i) => (
            <input
              key={i}
              value={w.titulo}
              onChange={(e) => setWins(wins.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)))}
              placeholder={`Win ${i + 1}`}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          ))}
        </div>
        {wins.length < 3 && (
          <button
            type="button"
            onClick={() => setWins([...wins, { titulo: '', dod: '' }])}
            className="mt-2 text-xs font-medium text-[#0A7C82]"
          >
            + agregar win
          </button>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase text-neutral-500">Vaciado</h2>
        <div className="space-y-3">
          {tasks.map((t, i) => (
            <div key={t.ref} className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
              <input
                value={t.titulo}
                onChange={(e) => setTasks(tasks.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)))}
                placeholder="Tarea"
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
              <div className="mt-2 flex gap-2">
                <input
                  value={t.projectNombre}
                  onChange={(e) => setTasks(tasks.map((x, j) => (j === i ? { ...x, projectNombre: e.target.value } : x)))}
                  placeholder="Proyecto"
                  className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  step="0.5"
                  value={t.estimadoHoras}
                  onChange={(e) => setTasks(tasks.map((x, j) => (j === i ? { ...x, estimadoHoras: Number(e.target.value) } : x)))}
                  placeholder="Horas"
                  className="w-24 rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
              <textarea
                value={t.dodText}
                onChange={(e) => setTasks(tasks.map((x, j) => (j === i ? { ...x, dodText: e.target.value } : x)))}
                placeholder="DoD — una línea por punto"
                rows={2}
                className="mt-2 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setTasks([...tasks, { ref: nextRef(), titulo: '', projectNombre: '', estimadoHoras: 1, dod: [], dodText: '' }])}
          className="mt-2 text-xs font-medium text-[#0A7C82]"
        >
          + agregar tarea
        </button>
      </section>

      <button
        onClick={submit}
        disabled={pending}
        className="w-full rounded-md bg-[#0A7C82] px-4 py-2 text-sm font-semibold text-white hover:bg-[#086a6f] disabled:opacity-50"
      >
        {pending ? 'Creando…' : 'Crear semana'}
      </button>
    </div>
  )
}
