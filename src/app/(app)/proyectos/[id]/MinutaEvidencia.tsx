'use client'

import { useState, useTransition } from 'react'
import { inferirEvidenciaAction, registrarEvidenciaInferidaAction } from './evidencia-actions'
import type { SugerenciaView } from './evidencia-actions'

// "¿Evidencia?" — el cierre del loop PMO→desarrollo. La junta ya está capturada;
// lo que faltaba era que alguien tradujera esos episodios a la rúbrica de VP, y
// ese trabajo a mano nunca se hace. La IA propone, Mau confirma con un tap.
//
// Regla dura: NADA se registra sin ese tap. Sin sugerencias aceptadas, este
// componente no escribe una sola fila.

type Estado = 'propuesta' | 'guardada' | 'descartada'

const CONFIANZA_LABEL: Record<SugerenciaView['confianza'], string> = {
  alta: 'la minuta lo dice',
  media: 'lectura del texto',
}

export function MinutaEvidencia({ minutaId }: { minutaId: string }): React.ReactElement {
  const [abierto, setAbierto] = useState(false)
  const [sugerencias, setSugerencias] = useState<SugerenciaView[] | null>(null)
  const [notas, setNotas] = useState<string[]>([])
  const [estados, setEstados] = useState<Estado[]>([])
  const [error, setError] = useState<string | null>(null)
  const [vacio, setVacio] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function inferir(): void {
    setError(null)
    setVacio(null)
    startTransition(async () => {
      const r = await inferirEvidenciaAction(minutaId)
      if (!r.ok) return setError(r.error)
      if (r.candidatosEvaluados === 0) {
        return setVacio('No hay reactivos que evaluar: configura tu nivel objetivo en /desarrollo.')
      }
      if (r.sugerencias.length === 0) {
        // Cero es un resultado legítimo y frecuente, no una falla: la mayoría de
        // las juntas son de seguimiento y no demuestran ninguna conducta.
        return setVacio('Esta junta no demuestra ningún reactivo. Es lo normal en una de seguimiento.')
      }
      setSugerencias(r.sugerencias)
      setNotas(r.sugerencias.map((s) => s.nota))
      setEstados(r.sugerencias.map(() => 'propuesta'))
    })
  }

  function marcar(i: number, estado: Estado): void {
    setEstados((prev) => prev.map((e, n) => (n === i ? estado : e)))
  }

  function registrar(i: number): void {
    if (!sugerencias) return
    const nota = notas[i].trim()
    if (nota === '') return setError('La evidencia necesita una nota.')
    setError(null)
    startTransition(async () => {
      try {
        await registrarEvidenciaInferidaAction({
          minutaId,
          competencyId: sugerencias[i].competencyId,
          nota,
        })
        marcar(i, 'guardada')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo registrar la evidencia.')
      }
    })
  }

  function editarNota(i: number, valor: string): void {
    setNotas((prev) => prev.map((n, k) => (k === i ? valor : n)))
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="mt-1 ml-1.5 rounded-full border border-neutral-300 px-2.5 py-0.5 text-[11px] font-bold text-neutral-500 hover:border-brand-deep hover:text-brand-deep"
      >
        ✨ ¿Evidencia?
      </button>
    )
  }

  return (
    <div className="mt-2 rounded-md border border-neutral-300 bg-white p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase text-brand-deep">Evidencia de desarrollo</p>
        <button onClick={() => setAbierto(false)} className="text-[11px] font-bold text-neutral-400">
          cerrar
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800"
        >
          {error}
        </div>
      )}
      {vacio && <p className="mt-1.5 rounded bg-neutral-100 px-2 py-1 text-[11px] text-neutral-600">{vacio}</p>}

      {sugerencias === null ? (
        <>
          <p className="mt-1 text-[11px] text-neutral-500">
            Busca en esta junta episodios que demuestren un reactivo de tu nivel objetivo o de los roles VP. Nada se
            registra sin que lo confirmes.
          </p>
          <button
            disabled={pending}
            onClick={inferir}
            className="mt-1.5 w-full rounded bg-brand-deep px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          >
            {pending ? '⏳ buscando…' : 'Buscar evidencia'}
          </button>
        </>
      ) : (
        <ul className="mt-2 space-y-2">
          {sugerencias.map((s, i) => (
            <li key={s.competencyId} className="rounded border border-neutral-200 p-2">
              <div className="flex flex-wrap items-center gap-1">
                <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-deep">
                  {s.competenciaBloque}
                </span>
                <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold text-neutral-500">
                  {CONFIANZA_LABEL[s.confianza]}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-neutral-600">{s.competenciaTexto}</p>

              {estados[i] === 'guardada' ? (
                <p className="mt-1.5 text-xs font-bold text-brand-deep">✓ Registrada en /desarrollo</p>
              ) : estados[i] === 'descartada' ? (
                <p className="mt-1.5 text-xs text-neutral-400">Descartada.</p>
              ) : (
                <>
                  <textarea
                    value={notas[i]}
                    onChange={(e) => editarNota(i, e.target.value)}
                    rows={2}
                    aria-label={`Nota de la evidencia ${i + 1}`}
                    className="mt-1.5 w-full rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-900"
                  />
                  <p className="mt-0.5 text-[10px] text-neutral-400">
                    Se guarda citando esta minuta, para poder verificarla después.
                  </p>
                  <div className="mt-1.5 flex gap-1.5">
                    <button
                      disabled={pending}
                      onClick={() => registrar(i)}
                      className="flex-1 rounded bg-brand-deep px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                    >
                      Registrar
                    </button>
                    <button
                      disabled={pending}
                      onClick={() => marcar(i, 'descartada')}
                      className="rounded border border-neutral-300 px-3 py-1.5 text-xs font-bold text-neutral-600"
                    >
                      Descartar
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
