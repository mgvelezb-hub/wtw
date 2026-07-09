'use client'

import { useMemo, useState, useTransition } from 'react'
import type { Task } from '@prisma/client'
import { captureAction, discardAction } from './actions'

type TaskWithProject = Task & { project: { nombre: string } | null }

export function InboxBoard({
  tasks,
  proyectos,
  herramientas,
  factores,
}: {
  tasks: TaskWithProject[]
  proyectos: { id: string; nombre: string }[]
  herramientas: readonly string[]
  factores: Record<string, number>
}) {
  const [pending, startTransition] = useTransition()
  const [titulo, setTitulo] = useState('')
  const [herramienta, setHerramienta] = useState('')
  const [projectId, setProjectId] = useState('')
  const [aliado, setAliado] = useState(false)
  const [estimadoMin, setEstimadoMin] = useState('')

  const factor = herramienta ? factores[herramienta] : undefined
  const sugerido = useMemo(() => {
    const base = Number(estimadoMin)
    if (!factor || !base || base <= 0) return null
    return Math.round(base * factor)
  }, [factor, estimadoMin])

  function reset() {
    setTitulo('')
    setHerramienta('')
    setProjectId('')
    setAliado(false)
    setEstimadoMin('')
  }

  function submit() {
    if (!titulo.trim()) return
    startTransition(() =>
      void captureAction({
        titulo,
        herramienta: herramienta || undefined,
        projectId: projectId || undefined,
        estimadoMin: sugerido ?? (estimadoMin ? Number(estimadoMin) : undefined),
        alcance: aliado ? 'aliado' : 'sow',
      })
    )
    reset()
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <h1 className="text-lg font-bold text-[#0c4a45]">📥 Inbox</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
      >
        <input
          type="text"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Descripción de la tarea…"
          disabled={pending}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A7C82]"
        />

        <div className="grid grid-cols-2 gap-2">
          <select
            value={herramienta}
            onChange={(e) => setHerramienta(e.target.value)}
            disabled={pending}
            className="rounded-md border border-neutral-300 px-2 py-2 text-sm text-neutral-700"
          >
            <option value="">Herramienta…</option>
            {herramientas.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>

          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            disabled={pending}
            className="rounded-md border border-neutral-300 px-2 py-2 text-sm text-neutral-700"
          >
            <option value="">Sin proyecto</option>
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>

        {projectId && (
          <label className="flex items-center gap-2 text-xs font-medium text-neutral-600">
            <input type="checkbox" checked={aliado} onChange={(e) => setAliado(e.target.checked)} disabled={pending} />
            Es trabajo adicional fuera del alcance (aliado)
          </label>
        )}

        <div>
          <input
            type="number"
            min={0}
            step={5}
            value={estimadoMin}
            onChange={(e) => setEstimadoMin(e.target.value)}
            placeholder="Estimado en minutos…"
            disabled={pending}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          {factor && estimadoMin && sugerido && (
            <p className="mt-1 text-xs text-[#0d6d63]">
              Con tareas de <strong>{herramienta}</strong> tu real ha sido en promedio {factor.toFixed(1)}× tu
              estimado — sugerido: <strong>{sugerido} min</strong>
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={pending || !titulo.trim()}
          className="w-full rounded-md bg-[#0A7C82] px-4 py-2 text-sm font-semibold text-white hover:bg-[#086a6f] disabled:opacity-50"
        >
          Agregar a pendientes
        </button>
      </form>

      <ul className="space-y-2">
        {tasks.map((t) => (
          <li key={t.id} className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium text-neutral-900">{t.titulo}</span>
              <button
                disabled={pending}
                onClick={() => startTransition(() => void discardAction(t.id))}
                className="shrink-0 text-xs font-medium text-neutral-400 hover:text-red-600"
              >
                Descartar
              </button>
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-neutral-500">
              {t.herramienta && (
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-medium">{t.herramienta}</span>
              )}
              {t.project && <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-medium">{t.project.nombre}</span>}
              {t.estimadoMin != null && <span>{t.estimadoMin} min</span>}
            </div>
          </li>
        ))}
        {tasks.length === 0 && <p className="text-sm text-neutral-400">Inbox vacío — todo triageado.</p>}
      </ul>
    </div>
  )
}
