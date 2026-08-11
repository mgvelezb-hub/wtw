'use client'

import { useState, useTransition } from 'react'
import type { CatalogoDesarrollo, RecursoView } from './service'
import { marcarRecursoAction, practicarRecursoAction } from './actions'

const ICONO: Record<string, string> = {
  libro: '📕',
  curso: '🎓',
  platica: '🎤',
  articulo: '📄',
  ejercicio: '🔁',
}

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: 'pendiente',
  en_curso: 'en curso',
  hecho: 'hecho',
  descartado: 'descartado',
}

function Recurso({
  r,
  pending,
  onEstado,
  onPracticar,
}: {
  r: RecursoView
  pending: boolean
  onEstado: (estado: 'pendiente' | 'en_curso' | 'hecho' | 'descartado') => void
  onPracticar: () => void
}): React.ReactElement {
  const [abierto, setAbierto] = useState(false)
  const esPractica = r.tipo === 'ejercicio' && r.cadencia !== null && r.cadencia !== 'una vez'

  return (
    <li
      className={`rounded-lg border p-2 ${
        r.estado === 'hecho'
          ? 'border-[#0d6d63]/40 bg-[#d3e4e0]/40'
          : r.estado === 'en_curso'
            ? 'border-[#e8b94a] bg-[#fdf6e3]'
            : r.estado === 'descartado'
              ? 'border-neutral-200 bg-neutral-50 opacity-60'
              : 'border-neutral-200 bg-white'
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="shrink-0" aria-hidden>
          {ICONO[r.tipo] ?? '•'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-neutral-900">
            {r.url ? (
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="underline decoration-neutral-300">
                {r.titulo}
              </a>
            ) : (
              r.titulo
            )}
            {r.fuente && <span className="ml-1 text-xs font-normal text-neutral-500">— {r.fuente}</span>}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] uppercase text-neutral-400">
            <span className="rounded bg-neutral-100 px-1 font-bold">{ETIQUETA_ESTADO[r.estado]}</span>
            {r.cadencia && <span>· {r.cadencia}</span>}
            {r.duracionMin !== null && <span>· {r.duracionMin} min</span>}
            {esPractica && r.veces > 0 && (
              <span className="rounded bg-[#0d6d63] px-1 font-bold text-white">{r.veces}× practicado</span>
            )}
          </p>
          <button
            onClick={() => setAbierto(!abierto)}
            className="mt-1 text-[10px] font-semibold uppercase text-[#0c4a45] hover:underline"
          >
            {abierto ? 'ocultar' : 'por qué sirve'}
          </button>
          {abierto && <p className="mt-1 text-xs text-neutral-600">{r.porQue}</p>}
        </div>

        <div className="flex shrink-0 flex-col gap-1">
          {esPractica ? (
            <button
              disabled={pending}
              onClick={onPracticar}
              className="rounded bg-[#0c4a45] px-2 py-1 text-[10px] font-bold text-white disabled:opacity-40"
              title="Registrar una práctica más"
            >
              +1 practicado
            </button>
          ) : (
            <>
              {r.estado !== 'en_curso' && r.estado !== 'hecho' && (
                <button
                  disabled={pending}
                  onClick={() => onEstado('en_curso')}
                  className="rounded border border-[#e8b94a] px-2 py-0.5 text-[10px] font-bold text-[#4a3a10] disabled:opacity-40"
                >
                  empezar
                </button>
              )}
              {r.estado !== 'hecho' && (
                <button
                  disabled={pending}
                  onClick={() => onEstado('hecho')}
                  className="rounded border border-[#0d6d63] px-2 py-0.5 text-[10px] font-bold text-[#0c4a45] disabled:opacity-40"
                >
                  hecho
                </button>
              )}
              {r.estado === 'pendiente' && (
                <button
                  disabled={pending}
                  onClick={() => onEstado('descartado')}
                  className="rounded px-2 py-0.5 text-[10px] font-bold text-neutral-400 hover:text-[#b43232] disabled:opacity-40"
                  title="Lo evalué y no aplica"
                >
                  no aplica
                </button>
              )}
              {r.estado !== 'pendiente' && (
                <button
                  disabled={pending}
                  onClick={() => onEstado('pendiente')}
                  className="rounded px-2 py-0.5 text-[10px] font-bold text-neutral-400 disabled:opacity-40"
                >
                  ↺
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  )
}

export function CatalogoSection({ catalogo }: { catalogo: CatalogoDesarrollo }): React.ReactElement {
  const [pending, startTransition] = useTransition()
  const [verRubros, setVerRubros] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sin esto un fallo del server action no deja rastro: el botón parece no hacer
  // nada, que es el mismo síntoma del bug de los diálogos suprimidos (bd42560).
  function estado(id: string, e: 'pendiente' | 'en_curso' | 'hecho' | 'descartado'): void {
    setError(null)
    startTransition(async () => {
      try {
        await marcarRecursoAction(id, e)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo guardar el estado.')
      }
    })
  }

  function practicar(id: string): void {
    setError(null)
    startTransition(async () => {
      try {
        await practicarRecursoAction(id)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo registrar la práctica.')
      }
    })
  }

  const { resumen } = catalogo

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-lg border border-[#b43232] bg-red-50 px-3 py-2 text-sm text-[#b43232]">
          {error}
        </p>
      )}

      <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-wide text-[#0c4a45]">Material de desarrollo</h2>
        <p className="mt-1 text-xs text-neutral-500">
          {resumen.total} recursos · {resumen.hechos} hechos · {resumen.enCurso} en curso · {resumen.practicados} prácticas
          registradas. Esto es el 10% del 70-20-10: existe para que la práctica sea deliberada, no para leerse completo.
        </p>
      </section>

      {catalogo.practicas.length > 0 && (
        <section className="rounded-xl border-2 border-[#0c4a45] bg-white p-4 shadow-sm">
          <h2 className="text-xs font-bold uppercase tracking-wide text-[#0c4a45]">Prácticas — el 70%</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Estos no se terminan, se repiten. Son lo que convierte una oportunidad en algo intencional.
          </p>
          <ul className="mt-2 space-y-1">
            {catalogo.practicas.map((r) => (
              <Recurso key={r.id} r={r} pending={pending} onEstado={(e) => estado(r.id, e)} onPracticar={() => practicar(r.id)} />
            ))}
          </ul>
        </section>
      )}

      {catalogo.porObjetivo.length > 0 && (
        <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="text-xs font-bold uppercase tracking-wide text-[#0c4a45]">Material por reactivo del nivel objetivo</h2>
          <div className="mt-2 space-y-3">
            {catalogo.porObjetivo.map((o) => (
              <div key={o.orden}>
                <p className="flex items-start gap-2 text-sm">
                  <span
                    className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                      o.conEvidencia ? 'bg-[#0d6d63] text-white' : 'bg-[#b43232] text-white'
                    }`}
                  >
                    {o.orden}
                  </span>
                  <span className="font-medium text-neutral-800">{o.texto}</span>
                </p>
                {o.recursos.length === 0 ? (
                  <p className="ml-8 mt-1 text-xs text-neutral-400">Sin material mapeado todavía.</p>
                ) : (
                  <ul className="ml-8 mt-1 space-y-1">
                    {o.recursos.map((r) => (
                      <Recurso
                        key={r.id}
                        r={r}
                        pending={pending}
                        onEstado={(e) => estado(r.id, e)}
                        onPracticar={() => practicar(r.id)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-[#0c4a45]">Material por rubro</h2>
          <button
            onClick={() => setVerRubros(!verRubros)}
            className="rounded-full border border-[#0c4a45] px-3 py-1 text-xs font-bold text-[#0c4a45] hover:bg-[#0c4a45]/10"
          >
            {verRubros ? 'Ocultar' : `Ver ${catalogo.porRubro.length} rubros`}
          </button>
        </div>
        <p className="mt-1 text-xs text-neutral-500">Ordenados con el rubro más hueco primero.</p>
        {verRubros && (
          <div className="mt-2 space-y-3">
            {catalogo.porRubro.map((g) => (
              <div key={g.rubro}>
                <p className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-neutral-800">{g.rubro}</span>
                  <span className="font-mono text-xs text-neutral-500">
                    {g.conEvidencia}/{g.total} con evidencia
                  </span>
                </p>
                <ul className="mt-1 space-y-1">
                  {g.recursos.map((r) => (
                    <Recurso
                      key={r.id}
                      r={r}
                      pending={pending}
                      onEstado={(e) => estado(r.id, e)}
                      onPracticar={() => practicar(r.id)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
