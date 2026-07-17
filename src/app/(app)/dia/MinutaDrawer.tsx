'use client'

import { useEffect, useState, useTransition } from 'react'
import type { MinutaItemTipo } from '@prisma/client'
import type { DayBlockView, ProyectoActivoView } from './service'
import {
  getMinutaExistenteAction,
  getAsistentesSugeridosAction,
  guardarItemAction,
  actualizarAsistentesAction,
  promoverItemAction,
  type MinutaView,
} from './minuta-actions'

const TIPO_LABEL: Record<MinutaItemTipo, string> = {
  acuerdo: 'Acuerdo',
  pendiente_nuestro: 'Pendiente nuestro',
  pendiente_cliente: 'Pendiente cliente',
  solicitud_data: 'Solicitud de data',
  decision: 'Decisión',
  actividad_nueva: 'Actividad nueva',
  riesgo: 'Riesgo',
  nota: 'Nota',
}

// Los 5 frecuentes primero — el resto queda accesible detrás de "más tipos"
// (§6 Tarea 6 del plan de fase 7).
const TIPOS_FRECUENTES: MinutaItemTipo[] = [
  'acuerdo',
  'pendiente_nuestro',
  'pendiente_cliente',
  'solicitud_data',
  'decision',
]
const TIPOS_MAS: MinutaItemTipo[] = ['actividad_nueva', 'riesgo', 'nota']

function TipoChip({ tipo, active, onClick }: { tipo: MinutaItemTipo; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
        active ? 'border-[#0c4a45] bg-[#0c4a45] text-white' : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
      }`}
    >
      {TIPO_LABEL[tipo]}
    </button>
  )
}

export function MinutaDrawer({
  block,
  fecha,
  proyectosActivos,
  onClose,
}: {
  block: DayBlockView
  fecha: string
  proyectosActivos: ProyectoActivoView[]
  onClose: () => void
}) {
  const esJuntaInterna = block.tipo === 'junta'

  const [cargando, setCargando] = useState(!!block.minutaId)
  const [minutaId, setMinutaId] = useState<string | null>(null)
  const [items, setItems] = useState<MinutaView['items']>([])
  const [titulo, setTitulo] = useState(block.titulo)
  const [proyectoId, setProyectoId] = useState<string | null>(block.proyectoId)
  const [asistentes, setAsistentes] = useState<string[]>([])
  const [asistenteInput, setAsistenteInput] = useState('')
  const [sugerencias, setSugerencias] = useState<string[]>([])
  const [tipo, setTipo] = useState<MinutaItemTipo>('acuerdo')
  const [texto, setTexto] = useState('')
  const [responsable, setResponsable] = useState('')
  const [fechaCompromiso, setFechaCompromiso] = useState('')
  const [mostrarMasTipos, setMostrarMasTipos] = useState(false)
  const [pending, startTransition] = useTransition()

  // Carga la minuta ya existente de esta junta, si la hay — se reabre en vez
  // de crear una duplicada (busca por blockId/calendarEventId).
  useEffect(() => {
    let cancelado = false
    async function cargar() {
      if (block.minutaId) {
        const target = esJuntaInterna ? { blockId: block.id } : { calendarEventId: block.calendarEventId! }
        const data = await getMinutaExistenteAction(target)
        if (cancelado) return
        if (data) {
          setMinutaId(data.id)
          setItems(data.items)
          setTitulo(data.titulo)
          setAsistentes(data.asistentes)
        }
      }
      if (!cancelado) setCargando(false)
    }
    void cargar()
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!proyectoId) return
    let cancelado = false
    getAsistentesSugeridosAction(proyectoId).then((s) => {
      if (!cancelado) setSugerencias(s)
    })
    return () => {
      cancelado = true
    }
  }, [proyectoId])

  function agregarAsistente(nombre: string) {
    const limpio = nombre.trim()
    if (!limpio || asistentes.includes(limpio)) return
    const next = [...asistentes, limpio]
    setAsistentes(next)
    setAsistenteInput('')
    if (minutaId) startTransition(() => void actualizarAsistentesAction(minutaId, next))
  }

  function quitarAsistente(nombre: string) {
    const next = asistentes.filter((a) => a !== nombre)
    setAsistentes(next)
    if (minutaId) startTransition(() => void actualizarAsistentesAction(minutaId, next))
  }

  // Agregar item = 1 interacción; el drawer permanece abierto para el
  // siguiente (contrato ≤10 seg/item). La minuta se crea lazy aquí, al
  // guardar el primer item — nunca al abrir el drawer.
  function guardarItem() {
    const textoActual = texto.trim()
    if (!textoActual || !proyectoId) return
    const responsableActual = responsable.trim()
    startTransition(async () => {
      const data = await guardarItemAction({
        minutaId,
        projectId: proyectoId,
        blockId: esJuntaInterna ? block.id : undefined,
        calendarEventId: esJuntaInterna ? undefined : (block.calendarEventId ?? undefined),
        fecha,
        titulo,
        asistentes,
        item: {
          tipo,
          texto: textoActual,
          responsable: responsableActual || undefined,
          fechaCompromiso: fechaCompromiso || undefined,
        },
      })
      setMinutaId(data.id)
      setItems(data.items)
      setTexto('')
      setResponsable('')
      setFechaCompromiso('')
    })
  }

  function promoverItem(itemId: string) {
    startTransition(async () => {
      const data = await promoverItemAction(itemId)
      setItems(data.items)
    })
  }

  const sugerenciasDisponibles = sugerencias.filter((s) => !asistentes.includes(s))

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-neutral-200 bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-[#0d6d63]">Minuta de junta</p>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="mt-0.5 w-full rounded border border-transparent bg-transparent text-lg font-bold text-[#0c4a45] focus:border-neutral-300 focus:bg-neutral-50 focus:outline-none"
            />
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md px-2 py-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            ✕
          </button>
        </div>

        {cargando ? (
          <p className="mt-6 text-sm text-neutral-400">Cargando…</p>
        ) : (
          <>
            {!block.proyectoId && (
              <div className="mt-4">
                <label className="text-xs font-bold uppercase text-neutral-500">Proyecto</label>
                <select
                  value={proyectoId ?? ''}
                  disabled={!!minutaId}
                  onChange={(e) => setProyectoId(e.target.value || null)}
                  className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm disabled:bg-neutral-100 disabled:text-neutral-500"
                >
                  <option value="" disabled>
                    Selecciona un proyecto…
                  </option>
                  {proyectosActivos.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {pr.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="mt-4">
              <label className="text-xs font-bold uppercase text-neutral-500">Asistentes</label>
              {asistentes.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {asistentes.map((a) => (
                    <span
                      key={a}
                      className="flex items-center gap-1 rounded-full bg-[#d3e4e0] px-2.5 py-1 text-xs font-semibold text-[#0c4a45]"
                    >
                      {a}
                      <button onClick={() => quitarAsistente(a)} className="text-[#0c4a45]/60 hover:text-[#0c4a45]">
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-1.5 flex gap-1.5">
                <input
                  value={asistenteInput}
                  onChange={(e) => setAsistenteInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      agregarAsistente(asistenteInput)
                    }
                  }}
                  placeholder="Agregar asistente…"
                  className="flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm"
                />
                <button
                  onClick={() => agregarAsistente(asistenteInput)}
                  className="rounded-md bg-neutral-100 px-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-200"
                >
                  +
                </button>
              </div>
              {sugerenciasDisponibles.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {sugerenciasDisponibles.map((s) => (
                    <button
                      key={s}
                      onClick={() => agregarAsistente(s)}
                      className="rounded-full border border-neutral-200 px-2 py-0.5 text-[11px] text-neutral-500 hover:border-[#0d6d63] hover:text-[#0d6d63]"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5 border-t border-neutral-100 pt-4">
              <p className="text-xs font-bold uppercase text-neutral-500">Nuevo item</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {TIPOS_FRECUENTES.map((t) => (
                  <TipoChip key={t} tipo={t} active={tipo === t} onClick={() => setTipo(t)} />
                ))}
              </div>
              <button
                type="button"
                onClick={() => setMostrarMasTipos((v) => !v)}
                className="mt-1.5 text-[11px] font-semibold text-neutral-400 hover:text-neutral-600"
              >
                {mostrarMasTipos ? '▾ menos tipos' : '▸ más tipos'}
              </button>
              {mostrarMasTipos && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {TIPOS_MAS.map((t) => (
                    <TipoChip key={t} tipo={t} active={tipo === t} onClick={() => setTipo(t)} />
                  ))}
                </div>
              )}

              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="¿Qué se dijo?"
                rows={2}
                className="mt-2 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              />
              <div className="mt-1.5 flex gap-1.5">
                <input
                  value={responsable}
                  onChange={(e) => setResponsable(e.target.value)}
                  placeholder="Responsable (opcional)"
                  className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm"
                />
                <input
                  type="date"
                  value={fechaCompromiso}
                  onChange={(e) => setFechaCompromiso(e.target.value)}
                  className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                />
              </div>
              <button
                type="button"
                disabled={pending || !texto.trim() || !proyectoId}
                onClick={guardarItem}
                className="mt-2 w-full rounded-md bg-[#e8b94a] px-3 py-2 text-sm font-bold text-[#4a3a10] hover:bg-[#dcae3e] disabled:opacity-50"
              >
                + Agregar item
              </button>
              {!proyectoId && <p className="mt-1 text-[11px] text-red-500">Selecciona un proyecto primero.</p>}
            </div>

            <div className="mt-5 border-t border-neutral-100 pt-4">
              <p className="text-xs font-bold uppercase text-neutral-500">Items capturados ({items.length})</p>
              <ul className="mt-2 space-y-2">
                {items.map((it) => (
                  <li key={it.id} className="rounded-md border border-neutral-200 p-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold uppercase text-neutral-600">
                        {TIPO_LABEL[it.tipo]}
                      </span>
                      {it.estado === 'convertido' ? (
                        <span className="rounded-full bg-[#15803d]/10 px-2 py-0.5 text-[10px] font-bold uppercase text-[#15803d]">
                          Convertido
                        </span>
                      ) : it.tipo !== 'nota' ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => promoverItem(it.id)}
                          className="text-[11px] font-bold text-[#0d6d63] hover:underline disabled:opacity-50"
                        >
                          → Promover
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-1 text-neutral-800">{it.texto}</p>
                    {(it.responsable || it.fechaCompromiso) && (
                      <p className="mt-1 text-[11px] text-neutral-400">
                        {it.responsable}
                        {it.responsable && it.fechaCompromiso ? ' · ' : ''}
                        {it.fechaCompromiso}
                      </p>
                    )}
                  </li>
                ))}
                {items.length === 0 && <li className="text-xs text-neutral-400">Sin items capturados todavía.</li>}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
