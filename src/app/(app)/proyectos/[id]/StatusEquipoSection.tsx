'use client'

import { useState, useTransition } from 'react'
import {
  generarStatusAction,
  guardarFinalAction,
  type ArtifactView,
} from './status-actions'

// Sección "Status para equipo" — genera un borrador con IA (nunca se envía
// sola: el botón "Copiar para Slack" es la aceptación del usuario, §1 del
// diseño). Historial de artifacts debajo.

const ESTADO_LABEL: Record<ArtifactView['estado'], string> = {
  borrador: 'Borrador',
  editado: 'Editado',
  enviado: 'Enviado',
  descartado: 'Descartado',
}

// Copia al portapapeles con fallback silencioso para contextos no seguros
// (http en LAN, por ejemplo) — navigator.clipboard requiere HTTPS.
async function copiarAlPortapapeles(texto: string): Promise<void> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto)
      return
    }
    throw new Error('clipboard API no disponible en este contexto')
  } catch {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = texto
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    } catch {
      // fallback silencioso — sin portapapeles disponible, el usuario copia a mano
    }
  }
}

function primerasLineas(texto: string, n: number): string {
  return texto.split('\n').filter((l) => l.trim().length > 0).slice(0, n).join(' ')
}

export function StatusEquipoSection({
  projectId,
  artifactsIniciales,
}: {
  projectId: string
  artifactsIniciales: ArtifactView[]
}) {
  const [artifacts, setArtifacts] = useState<ArtifactView[]>(artifactsIniciales)
  // El activo para edición: el más reciente que aún no fue enviado, si existe
  // (permite retomar un borrador guardado en una sesión anterior).
  const [activo, setActivo] = useState<ArtifactView | null>(
    artifactsIniciales.find((a) => a.estado !== 'enviado') ?? null
  )
  const [texto, setTexto] = useState(activo?.final ?? activo?.borrador ?? '')
  const [error, setError] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [mostrarInsumos, setMostrarInsumos] = useState(false)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()

  function alGenerar() {
    setError(null)
    startTransition(async () => {
      try {
        const artifact = await generarStatusAction(projectId)
        setArtifacts((prev) => [artifact, ...prev])
        setActivo(artifact)
        setTexto(artifact.borrador)
        setCopiado(false)
        setMostrarInsumos(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'no se pudo generar el status')
      }
    })
  }

  function reemplazarEnHistorial(actualizado: ArtifactView) {
    setArtifacts((prev) => prev.map((a) => (a.id === actualizado.id ? actualizado : a)))
    setActivo(actualizado)
  }

  function alCopiar() {
    if (!activo) return
    startTransition(async () => {
      await copiarAlPortapapeles(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
      try {
        const actualizado = await guardarFinalAction(activo.id, texto, 'enviado')
        reemplazarEnHistorial(actualizado)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'no se pudo guardar el status')
      }
    })
  }

  function alGuardarBorrador() {
    if (!activo) return
    startTransition(async () => {
      try {
        const actualizado = await guardarFinalAction(activo.id, texto, 'editado')
        reemplazarEnHistorial(actualizado)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'no se pudo guardar el borrador')
      }
    })
  }

  function alternarExpandido(id: string) {
    setExpandidos((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section className="hair pt-6">
      <h2 className="lbl mb-2">Status para equipo</h2>

      <div className="rounded-lg border border-hair bg-surface p-3">
        <button
          type="button"
          onClick={alGenerar}
          disabled={pending}
          className="rounded-md bg-brand-deep px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending && !activo ? 'Generando…' : 'Generar status'}
        </button>
        {pending && (
          <p className="mt-2 text-xs text-muted">
            Puede tardar unos segundos — el modelo está redactando el borrador.
          </p>
        )}

        {error && (
          <div className="mt-3 rounded-md border border-warn-border bg-warn-soft p-2 text-sm text-warn">
            {error}
          </div>
        )}

        {activo && (
          <div className="mt-4 space-y-3">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={14}
              className="w-full rounded-md border border-hair p-2 font-mono text-xs text-ink"
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={alCopiar}
                disabled={pending}
                className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {copiado ? 'Copiado ✓' : 'Copiar para Slack'}
              </button>
              <button
                type="button"
                onClick={alGuardarBorrador}
                disabled={pending}
                className="rounded-md border border-hair bg-surface px-3 py-1.5 text-sm font-medium text-brand-deep disabled:opacity-50"
              >
                Guardar borrador editado
              </button>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setMostrarInsumos((v) => !v)}
                className="text-xs font-semibold text-muted underline"
              >
                {mostrarInsumos ? 'Ocultar insumos usados' : 'Ver insumos usados'}
              </button>
              {mostrarInsumos && (
                <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-paper p-2 text-[10px] text-muted">
                  {JSON.stringify(activo.insumos, null, 2)}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>

      {artifacts.length > 0 && (
        <div className="mt-4">
          <h3 className="lbl mb-1">Historial</h3>
          <div className="divide-y divide-hair">
            {artifacts.map((a) => {
              const expandido = expandidos.has(a.id)
              const textoCompleto = a.final ?? a.borrador
              return (
                <div key={a.id} className="py-3 text-sm">
                  <button
                    type="button"
                    onClick={() => alternarExpandido(a.id)}
                    className="flex w-full items-start justify-between gap-2 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {/* timeZone explícito: sin él, el SSR (UTC en Vercel) y el
                            cliente (MX) formatean fechas distintas cerca de la
                            medianoche UTC — hydration mismatch. */}
                        <span className="num text-xs text-muted">
                          {new Date(a.createdAt).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })}
                        </span>
                        <span className="rounded-full bg-hair px-2 py-0.5 text-[10px] font-semibold uppercase text-muted">
                          {ESTADO_LABEL[a.estado]}
                        </span>
                      </div>
                      {!expandido && (
                        <p className="mt-1 truncate text-muted">{primerasLineas(textoCompleto, 2)}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-faint">{expandido ? '▲' : '▼'}</span>
                  </button>
                  {expandido && (
                    <pre className="mt-2 whitespace-pre-wrap text-xs text-ink">{textoCompleto}</pre>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
