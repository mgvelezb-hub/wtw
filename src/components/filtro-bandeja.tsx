'use client'

import { conteoPorProyecto, SIN_PROYECTO, type Pendiente } from '@/lib/filtrar-pendientes'

// Los controles de la bandeja: buscar y filtrar por proyecto.
//
// Los chips llevan el conteo porque la pregunta real no es "¿existe Cuervo?"
// sino "¿cuánto me queda de Cuervo?". Y el chip activo se apaga tocándolo otra
// vez: sin salida visible, filtrar da miedo.
//
// El buscador solo aparece cuando la lista pasa de `MINIMO_BUSCADOR`. Debajo de
// eso ocupa un blanco táctil y una línea por nada — leerla completa es más
// rápido que teclear.
const MINIMO_BUSCADOR = 12

export function FiltroBandeja({
  items,
  texto,
  onTexto,
  proyecto,
  onProyecto,
  visibles,
}: {
  items: readonly Pendiente[]
  texto: string
  onTexto: (v: string) => void
  proyecto: string | null
  onProyecto: (v: string | null) => void
  visibles: number
}) {
  const grupos = conteoPorProyecto(items)
  if (items.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {items.length >= MINIMO_BUSCADOR && (
        <div className="relative">
          <input
            value={texto}
            onChange={(e) => onTexto(e.target.value)}
            placeholder="Buscar en la bandeja…"
            aria-label="Buscar en la bandeja"
            className="min-h-11 w-full rounded-lg border border-hair bg-surface px-3 pr-9 text-xs text-ink outline-none focus:border-brand"
          />
          {texto !== '' && (
            <button
              type="button"
              onClick={() => onTexto('')}
              aria-label="Limpiar la búsqueda"
              className="toque absolute right-1 top-1/2 -translate-y-1/2 px-2 text-sm font-bold text-faint hover:text-ink"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {grupos.length > 1 && (
        <div className="-mx-0.5 flex flex-wrap gap-1" role="group" aria-label="Filtrar por proyecto">
          {grupos.map((g) => {
            const activo = proyecto === g.proyecto
            return (
              <button
                key={g.proyecto}
                type="button"
                aria-pressed={activo}
                onClick={() => onProyecto(activo ? null : g.proyecto)}
                className={`flex min-h-11 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition-colors ${
                  activo
                    ? 'border-brand bg-brand text-sobre-brand'
                    : 'border-hair text-muted hover:border-brand hover:text-brand'
                }`}
              >
                <span className="max-w-[9rem] truncate">
                  {g.proyecto === SIN_PROYECTO ? 'Sin proyecto' : g.proyecto}
                </span>
                <span className="num opacity-70">{g.cuantas}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Con un filtro puesto, la cuenta del encabezado deja de describir lo que
          se ve. Decirlo evita creer que la bandeja se vació. */}
      {(proyecto !== null || texto !== '') && (
        <p className="text-[11px] text-faint">
          {visibles === 0 ? 'Nada coincide' : `${visibles} de ${items.length}`}
          {' · '}
          <button type="button" onClick={() => { onProyecto(null); onTexto('') }} className="underline hover:text-ink">
            ver todo
          </button>
        </p>
      )}
    </div>
  )
}
