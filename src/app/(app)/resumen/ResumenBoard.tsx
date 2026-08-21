'use client'

import { useState, useTransition } from 'react'
import { generarResumenAction, guardarResumenFinalAction, marcarResumenEnviadoAction } from './actions'
import type { AlcanceResumen } from './service'

type Previo = { id: string; etiqueta: string; texto: string; estado: string; fecha: string }

const ALCANCES = [
  { clave: 'junta', label: 'Una junta', ayuda: 'Solo lo que pasó en esa sesión' },
  { clave: 'periodo', label: 'Periodo', ayuda: 'Todas las juntas entre dos fechas' },
  { clave: 'dia', label: 'Un día', ayuda: 'Juntas y tareas agendadas ese día' },
  { clave: 'semana', label: 'Una semana', ayuda: 'Juntas y tareas de la semana ISO' },
  { clave: 'proyecto', label: 'Un proyecto', ayuda: 'Todo lo abierto del proyecto' },
  { clave: 'global', label: 'Global', ayuda: 'Todo lo abierto, sin filtro' },
] as const

type ClaveAlcance = (typeof ALCANCES)[number]['clave']

export function ResumenBoard({
  minutas,
  proyectos,
  hoy,
  isoWeek,
  previos,
}: {
  minutas: Array<{ id: string; etiqueta: string }>
  proyectos: Array<{ id: string; nombre: string }>
  hoy: string
  isoWeek: string
  previos: Previo[]
}): React.ReactElement {
  const [clave, setClave] = useState<ClaveAlcance>('junta')
  const [minutaId, setMinutaId] = useState(minutas[0]?.id ?? '')
  const [projectId, setProjectId] = useState(proyectos[0]?.id ?? '')
  const [desde, setDesde] = useState(hoy)
  const [hasta, setHasta] = useState(hoy)
  const [fecha, setFecha] = useState(hoy)
  const [semana, setSemana] = useState(isoWeek)

  const [texto, setTexto] = useState<string | null>(null)
  const [artifactId, setArtifactId] = useState<string | null>(null)
  const [meta, setMeta] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)
  const [pending, startTransition] = useTransition()

  function alcanceActual(): AlcanceResumen {
    switch (clave) {
      case 'junta':
        return { tipo: 'junta', minutaId }
      case 'periodo':
        return { tipo: 'periodo', desde, hasta, projectId: projectId || undefined }
      case 'dia':
        return { tipo: 'dia', fecha }
      case 'semana':
        return { tipo: 'semana', isoWeek: semana }
      case 'proyecto':
        return { tipo: 'proyecto', projectId }
      default:
        return { tipo: 'global' }
    }
  }

  function generar(): void {
    setError(null)
    setGuardado(false)
    startTransition(async () => {
      const r = await generarResumenAction(alcanceActual())
      if (!r.ok) {
        setError(r.error)
        setTexto(null)
        return
      }
      setTexto(r.texto)
      setArtifactId(r.artifactId)
      setMeta(
        `${r.etiqueta} · ${r.insumos.minutas} minutas, ${r.insumos.tareas} tareas, ${r.insumos.issues} issues, ${r.insumos.entregables} entregables`
      )
    })
  }

  const faltaDato =
    (clave === 'junta' && minutaId === '') || (clave === 'proyecto' && projectId === '')

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-bold text-brand-deep">Resumen con IA</h1>
        <p className="text-xs text-neutral-500">
          Cruza lo que se dijo (minutas capturadas) con lo que sigue vivo (tareas, issues y entregables abiertos).
        </p>
      </header>

      <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-wide text-brand-deep">Alcance</h2>
        <div className="mt-2 flex flex-wrap gap-1">
          {ALCANCES.map((a) => (
            <button
              key={a.clave}
              onClick={() => setClave(a.clave)}
              title={a.ayuda}
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                clave === a.clave ? 'bg-brand-deep text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-neutral-400">{ALCANCES.find((a) => a.clave === clave)?.ayuda}</p>

        <div className="mt-3 space-y-2">
          {clave === 'junta' && (
            <select
              value={minutaId}
              onChange={(e) => setMinutaId(e.target.value)}
              aria-label="Junta"
              className="w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900"
            >
              {minutas.length === 0 && <option value="">Sin minutas capturadas</option>}
              {minutas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.etiqueta}
                </option>
              ))}
            </select>
          )}

          {clave === 'periodo' && (
            <div className="flex flex-wrap gap-1.5">
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                aria-label="Desde"
                className="rounded border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900"
              />
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                aria-label="Hasta"
                className="rounded border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900"
              />
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                aria-label="Proyecto (opcional)"
                className="rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-600"
              >
                <option value="">Todos los proyectos</option>
                {proyectos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}

          {clave === 'dia' && (
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              aria-label="Día"
              className="rounded border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900"
            />
          )}

          {clave === 'semana' && (
            <input
              value={semana}
              onChange={(e) => setSemana(e.target.value)}
              aria-label="Semana ISO"
              placeholder="2026-W33"
              className="w-32 rounded border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900"
            />
          )}

          {clave === 'proyecto' && (
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              aria-label="Proyecto"
              className="w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900"
            >
              {proyectos.length === 0 && <option value="">Sin proyectos activos</option>}
              {proyectos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          )}
        </div>

        <button
          disabled={pending || faltaDato}
          onClick={generar}
          className="mt-3 w-full rounded-full bg-brand-deep px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          {pending ? '⏳ generando…' : '✨ Generar resumen'}
        </button>

        {error && (
          <p role="alert" className="mt-2 rounded border border-danger bg-red-50 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </section>

      {texto !== null && (
        <section className="rounded-xl border-2 border-brand-deep bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-brand-deep">Resumen</h2>
            <div className="flex gap-1.5">
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(texto)
                  if (artifactId) startTransition(() => void marcarResumenEnviadoAction(artifactId))
                }}
                className="rounded-full border border-brand-deep px-3 py-1 text-xs font-bold text-brand-deep"
              >
                Copiar
              </button>
              <button
                disabled={pending || !artifactId}
                onClick={() => {
                  setGuardado(false)
                  startTransition(async () => {
                    try {
                      await guardarResumenFinalAction(artifactId!, texto)
                      setGuardado(true)
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
                    }
                  })
                }}
                className="rounded-full bg-brand px-3 py-1 text-xs font-bold text-white disabled:opacity-40"
              >
                Guardar edición
              </button>
            </div>
          </div>
          {meta && <p className="mt-1 text-[11px] text-neutral-400">{meta}</p>}
          {guardado && <p className="mt-1 text-xs text-brand-deep">Versión editada guardada.</p>}

          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={22}
            aria-label="Texto del resumen"
            className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 font-mono text-xs text-neutral-900"
          />
          <p className="mt-1 text-[11px] text-neutral-400">
            Lo que edites se guarda aparte: el borrador original nunca se sobrescribe.
          </p>
        </section>
      )}

      {previos.length > 0 && (
        <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="text-xs font-bold uppercase tracking-wide text-brand-deep">Resúmenes anteriores</h2>
          <ul className="mt-2 space-y-1">
            {previos.map((p) => (
              <li key={p.id} className="flex items-baseline justify-between gap-2 text-sm">
                <button
                  onClick={() => {
                    setTexto(p.texto)
                    setArtifactId(p.id)
                    setMeta(`${p.etiqueta} · generado ${p.fecha}`)
                  }}
                  className="min-w-0 text-left text-neutral-800 hover:underline"
                >
                  {p.etiqueta}
                </button>
                <span className="shrink-0 text-[10px] uppercase text-neutral-400">
                  {p.fecha} · {p.estado}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
