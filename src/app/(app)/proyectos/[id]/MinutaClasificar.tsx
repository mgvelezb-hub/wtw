'use client'

import { useState, useTransition } from 'react'
import type { MinutaItemTipo } from '@prisma/client'
import {
  clasificarMinutaAction,
  guardarItemsClasificadosAction,
  guardarNotasMinutaAction,
} from '@/app/(app)/dia/minuta-ai-actions'
import type { ItemPropuesto } from '@/app/(app)/dia/normalizar-clasificacion'

const TIPO_LABEL: Record<MinutaItemTipo, string> = {
  acuerdo: 'Acuerdo',
  decision: 'Decisión',
  pendiente_nuestro: 'Pendiente nuestro',
  pendiente_cliente: 'Pendiente cliente',
  solicitud_data: 'Solicitud de datos',
  actividad_nueva: 'Actividad nueva',
  riesgo: 'Riesgo',
  nota: 'Nota',
}

// Clasificación de una minuta YA capturada, desde donde las minutas se leen.
// Antes solo se podía clasificar desde el drawer de /dia, lo que obligaba a
// navegar al día exacto de la junta para tocar una minuta de la semana pasada.
export function MinutaClasificar({ minutaId, tieneNotas }: { minutaId: string; tieneNotas: boolean }): React.ReactElement {
  const [abierto, setAbierto] = useState(false)
  const [pegado, setPegado] = useState('')
  const [propuestos, setPropuestos] = useState<ItemPropuesto[] | null>(null)
  const [aceptados, setAceptados] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function clasificar(): void {
    setError(null)
    setOk(null)
    startTransition(async () => {
      // Si hay texto pegado se guarda primero en `notas`: es el bloque crudo, y
      // conservarlo permite reclasificar después sin volver a pegarlo.
      if (pegado.trim() !== '') {
        try {
          await guardarNotasMinutaAction(minutaId, pegado.trim())
        } catch (e) {
          setError(e instanceof Error ? e.message : 'No se pudo guardar el texto.')
          return
        }
      }
      const r = await clasificarMinutaAction({ texto: pegado.trim() || undefined, minutaId })
      if (!r.ok) return setError(r.error)
      if (r.items.length === 0) return setError('La IA no encontró items que clasificar.')
      setPropuestos(r.items)
      setAceptados(new Set(r.items.map((_, i) => i)))
    })
  }

  function agregar(): void {
    if (!propuestos) return
    const elegidos = propuestos.filter((_, i) => aceptados.has(i))
    if (elegidos.length === 0) return
    setError(null)
    startTransition(async () => {
      try {
        const n = await guardarItemsClasificadosAction(minutaId, elegidos)
        setPropuestos(null)
        setPegado('')
        setOk(`${n} items agregados. Recarga para verlos en la lista.`)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudieron guardar los items.')
      }
    })
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="mt-1 rounded-full border border-brand-deep px-2.5 py-0.5 text-[11px] font-bold text-brand-deep hover:bg-brand-deep/10"
      >
        ✨ Clasificar con IA
      </button>
    )
  }

  return (
    <div className="mt-2 rounded-md border border-brand-deep bg-white p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase text-brand-deep">Clasificar con IA</p>
        <button onClick={() => setAbierto(false)} className="text-[11px] font-bold text-neutral-400">
          cerrar
        </button>
      </div>

      <p className="mt-1 text-[11px] text-neutral-500">
        {tieneNotas
          ? 'Esta minuta ya tiene texto crudo guardado. Puedes clasificarlo tal cual, o pegar más abajo.'
          : 'Pega el texto de la junta, o déjalo vacío para clasificar las notas ya capturadas.'}
      </p>

      <textarea
        value={pegado}
        onChange={(e) => setPegado(e.target.value)}
        rows={4}
        aria-label="Texto crudo de la junta"
        placeholder="Pega aquí el bloque de la junta…"
        className="mt-1.5 w-full rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-900"
      />

      {error && (
        <p role="alert" className="mt-1.5 rounded border border-danger bg-red-50 px-2 py-1 text-[11px] text-danger">
          {error}
        </p>
      )}
      {ok && <p className="mt-1.5 rounded bg-brand-soft px-2 py-1 text-[11px] text-brand-deep">{ok}</p>}

      {propuestos === null ? (
        <button
          disabled={pending}
          onClick={clasificar}
          className="mt-1.5 w-full rounded bg-brand-deep px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
        >
          {pending ? '⏳ clasificando…' : 'Clasificar'}
        </button>
      ) : (
        <>
          <p className="mt-2 text-[11px] font-bold uppercase text-brand-deep">
            {propuestos.length} propuestos — destilda los que no
          </p>
          <ul className="mt-1 space-y-1">
            {propuestos.map((p, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={aceptados.has(i)}
                  aria-label={`Aceptar propuesto ${i + 1}`}
                  onChange={(e) => {
                    const next = new Set(aceptados)
                    if (e.target.checked) next.add(i)
                    else next.delete(i)
                    setAceptados(next)
                  }}
                />
                <span className="min-w-0">
                  <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-neutral-600">
                    {TIPO_LABEL[p.tipo]}
                  </span>
                  <span className="ml-1 text-neutral-800">{p.texto}</span>
                  {p.responsable && <span className="ml-1 text-neutral-500">— {p.responsable}</span>}
                  {p.fechaCompromiso && (
                    <span className="ml-1 rounded bg-neutral-100 px-1 text-[10px] font-bold text-neutral-600">
                      {p.fechaCompromiso}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-1.5 flex gap-1.5">
            <button
              disabled={pending || aceptados.size === 0}
              onClick={agregar}
              className="flex-1 rounded bg-brand-deep px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              Agregar {aceptados.size}
            </button>
            <button
              disabled={pending}
              onClick={() => setPropuestos(null)}
              className="rounded border border-neutral-300 px-3 py-1.5 text-xs font-bold text-neutral-600"
            >
              Descartar
            </button>
          </div>
        </>
      )}
    </div>
  )
}
