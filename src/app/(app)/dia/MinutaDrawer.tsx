'use client'

import { useEffect, useState, useTransition } from 'react'
import type { MinutaItemTipo } from '@prisma/client'
import type { DayBlockView, ProyectoActivoView } from './service'
import { MinutaEditor } from './MinutaEditor'
import {
  getMinutaExistenteAction,
  getAsistentesSugeridosAction,
  guardarItemAction,
  actualizarAsistentesAction,
  promoverItemAction,
  type MinutaView,
} from './minuta-actions'
import { clasificarMinutaAction, guardarItemsClasificadosAction } from './minuta-ai-actions'
import type { ItemPropuesto } from './normalizar-clasificacion'

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
        active ? 'border-brand-deep bg-brand-deep text-white' : 'border-hair text-muted hover:border-brand-strong hover:text-brand-strong'
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
  const [textoRich, setTextoRich] = useState('')
  const [responsable, setResponsable] = useState('')
  const [fechaCompromiso, setFechaCompromiso] = useState('')
  const [mostrarMasTipos, setMostrarMasTipos] = useState(false)
  const [pending, startTransition] = useTransition()
  // Clasificación con IA: propone items a partir del texto crudo; nada se guarda
  // hasta que Mau acepta. Un error del modelo no debe ensuciar la minuta.
  const [propuestos, setPropuestos] = useState<ItemPropuesto[] | null>(null)
  const [aceptados, setAceptados] = useState<Set<number>>(new Set())
  const [errorIA, setErrorIA] = useState<string | null>(null)
  const [clasificando, setClasificando] = useState(false)

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
          // Sin esto el select quedaba deshabilitado (por minutaId) Y vacío (porque
          // block.proyectoId es null en juntas de Outlook): imposible agregar más
          // items — pedía proyecto y no dejaba elegirlo.
          setProyectoId(data.projectId)
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
          textoRich: textoRich || undefined,
          responsable: responsableActual || undefined,
          fechaCompromiso: fechaCompromiso || undefined,
        },
      })
      setMinutaId(data.id)
      setItems(data.items)
      setTexto('')
      setTextoRich('')
      setResponsable('')
      setFechaCompromiso('')
    })
  }

  function clasificar() {
    setErrorIA(null)
    setClasificando(true)
    startTransition(async () => {
      try {
        const r = await clasificarMinutaAction({ texto: texto.trim(), minutaId: minutaId ?? undefined })
        if (!r.ok) setErrorIA(r.error)
        else if (r.items.length === 0) setErrorIA('La IA no encontró items que clasificar.')
        else {
          setPropuestos(r.items)
          setAceptados(new Set(r.items.map((_, i) => i)))
        }
      } finally {
        setClasificando(false)
      }
    })
  }

  function agregarClasificados() {
    if (!propuestos || !proyectoId) return
    const elegidos = propuestos.filter((_, i) => aceptados.has(i))
    if (elegidos.length === 0) return

    startTransition(async () => {
      try {
        // La minuta puede no existir aún (se crea lazy al primer item). Se crea
        // con el primer clasificado y el resto se agrega en bloque.
        let id = minutaId
        let restantes = elegidos
        if (!id) {
          const primero = elegidos[0]
          const data = await guardarItemAction({
            minutaId: null,
            projectId: proyectoId,
            blockId: esJuntaInterna ? block.id : undefined,
            calendarEventId: esJuntaInterna ? undefined : (block.calendarEventId ?? undefined),
            fecha,
            titulo,
            asistentes,
            item: {
              tipo: primero.tipo,
              texto: primero.texto,
              responsable: primero.responsable,
              fechaCompromiso: primero.fechaCompromiso,
            },
          })
          id = data.id
          setMinutaId(data.id)
          restantes = elegidos.slice(1)
        }
        if (restantes.length > 0) await guardarItemsClasificadosAction(id, restantes)

        const data = await getMinutaExistenteAction(
          esJuntaInterna ? { blockId: block.id } : { calendarEventId: block.calendarEventId ?? '' }
        )
        if (data) setItems(data.items)
        setPropuestos(null)
        setTexto('')
        setTextoRich('')
      } catch (e) {
        setErrorIA(e instanceof Error ? e.message : 'No se pudieron guardar los items.')
      }
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
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-hair bg-surface p-5 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="lbl text-brand-strong">Minuta de junta</p>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="mt-0.5 w-full rounded border border-transparent bg-transparent text-lg font-bold text-brand-deep focus:border-hair focus:bg-paper focus:outline-none"
            />
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md px-2 py-1 text-faint hover:bg-hair hover:text-ink"
          >
            ✕
          </button>
        </div>

        {cargando ? (
          <p className="mt-6 text-sm text-faint">Cargando…</p>
        ) : (
          <>
            {!block.proyectoId && (
              <div className="mt-4">
                <label className="lbl">Proyecto</label>
                <select
                  value={proyectoId ?? ''}
                  disabled={!!minutaId}
                  onChange={(e) => setProyectoId(e.target.value || null)}
                  className="mt-1 w-full rounded-md border border-hair px-2 py-1.5 text-sm disabled:bg-hair disabled:text-ink"
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
              <label className="lbl">Asistentes</label>
              {asistentes.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {asistentes.map((a) => (
                    <span
                      key={a}
                      className="flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand-deep"
                    >
                      {a}
                      <button onClick={() => quitarAsistente(a)} className="text-brand-deep/60 hover:text-brand-deep">
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
                  className="flex-1 rounded-md border border-hair px-2 py-1 text-sm"
                />
                <button
                  onClick={() => agregarAsistente(asistenteInput)}
                  className="rounded-md bg-hair px-2.5 text-sm font-semibold text-ink hover:bg-hair"
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
                      className="rounded-full border border-hair px-2 py-0.5 text-[11px] text-muted hover:border-brand-strong hover:text-brand-strong"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5 border-t border-hair pt-4">
              <p className="lbl">Nuevo item</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {TIPOS_FRECUENTES.map((t) => (
                  <TipoChip key={t} tipo={t} active={tipo === t} onClick={() => setTipo(t)} />
                ))}
              </div>
              <button
                type="button"
                onClick={() => setMostrarMasTipos((v) => !v)}
                className="mt-1.5 text-[11px] font-semibold text-faint hover:text-muted"
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

              <MinutaEditor
                html={textoRich}
                placeholder="¿Qué se dijo?"
                onChange={({ html, texto }) => {
                  setTextoRich(html)
                  setTexto(texto)
                }}
              />
              <div className="mt-1.5 flex gap-1.5">
                <input
                  value={responsable}
                  onChange={(e) => setResponsable(e.target.value)}
                  placeholder="Responsable (opcional)"
                  className="min-w-0 flex-1 rounded-md border border-hair px-2 py-1 text-sm"
                />
                <input
                  type="date"
                  value={fechaCompromiso}
                  onChange={(e) => setFechaCompromiso(e.target.value)}
                  className="rounded-md border border-hair px-2 py-1 text-sm"
                />
              </div>
              <button
                type="button"
                disabled={pending || !texto.trim() || !proyectoId}
                onClick={guardarItem}
                className="mt-2 w-full rounded-md bg-brand px-3 py-2 text-sm font-bold text-white hover:bg-brand-strong disabled:opacity-50"
              >
                + Agregar item
              </button>

              <button
                type="button"
                disabled={pending || clasificando || !proyectoId || (!texto.trim() && !minutaId)}
                onClick={clasificar}
                className="mt-1.5 w-full rounded-md border border-brand-deep px-3 py-2 text-sm font-bold text-brand-deep hover:bg-brand-deep/10 disabled:opacity-50"
                title="Parte el texto en acuerdos, pendientes, decisiones y riesgos"
              >
                {clasificando ? '⏳ clasificando…' : '✨ Clasificar con IA'}
              </button>

              {errorIA && (
                <p role="alert" className="mt-1.5 rounded border border-danger bg-danger-soft px-2 py-1 text-[11px] text-danger">
                  {errorIA}
                </p>
              )}

              {propuestos && (
                <div className="mt-2 rounded-md border-2 border-brand-deep bg-surface p-2">
                  <p className="lbl text-brand-deep">
                    {propuestos.length} items propuestos — destilda los que no
                  </p>
                  <ul className="mt-1.5 space-y-1.5">
                    {propuestos.map((p, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={aceptados.has(i)}
                          aria-label={`Aceptar item ${i + 1}`}
                          onChange={(e) => {
                            const next = new Set(aceptados)
                            if (e.target.checked) next.add(i)
                            else next.delete(i)
                            setAceptados(next)
                          }}
                        />
                        <span className="min-w-0">
                          <span className="rounded-full bg-hair px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted">
                            {TIPO_LABEL[p.tipo]}
                          </span>
                          <span className="ml-1 text-ink">{p.texto}</span>
                          {p.responsable && <span className="ml-1 text-[11px] text-muted">— {p.responsable}</span>}
                          {p.fechaCompromiso && (
                            <span className="ml-1 rounded bg-brand-soft px-1 text-[10px] font-bold text-brand-deep">
                              {p.fechaCompromiso}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex gap-1.5">
                    <button
                      type="button"
                      disabled={pending || aceptados.size === 0}
                      onClick={agregarClasificados}
                      className="flex-1 rounded-md bg-brand-deep px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50"
                    >
                      Agregar {aceptados.size}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setPropuestos(null)}
                      className="rounded-md border border-hair px-3 py-1.5 text-sm font-bold text-muted"
                    >
                      Descartar
                    </button>
                  </div>
                </div>
              )}
              {!proyectoId && <p className="mt-1 text-[11px] text-danger">Selecciona un proyecto primero.</p>}
            </div>

            <div className="mt-5 border-t border-hair pt-4">
              <p className="lbl">Items capturados ({items.length})</p>
              <ul className="mt-1">
                {items.map((it) => (
                  <li key={it.id} className="hair py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full bg-hair px-2 py-0.5 text-[10px] font-bold uppercase text-muted">
                        {TIPO_LABEL[it.tipo]}
                      </span>
                      {it.estado === 'convertido' ? (
                        <span className="rounded-full bg-ok/10 px-2 py-0.5 text-[10px] font-bold uppercase text-ok">
                          Convertido
                        </span>
                      ) : it.tipo !== 'nota' ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => promoverItem(it.id)}
                          className="text-[11px] font-bold text-brand-strong hover:underline disabled:opacity-50"
                        >
                          → Promover
                        </button>
                      ) : null}
                    </div>
                    {it.textoRich ? (
                      <div
                        className="minuta-rich mt-1 text-ink"
                        dangerouslySetInnerHTML={{ __html: it.textoRich }}
                      />
                    ) : (
                      <p className="mt-1 text-ink">{it.texto}</p>
                    )}
                    {(it.responsable || it.fechaCompromiso) && (
                      <p className="mt-1 text-[11px] text-faint">
                        {it.responsable}
                        {it.responsable && it.fechaCompromiso ? ' · ' : ''}
                        {it.fechaCompromiso}
                      </p>
                    )}
                  </li>
                ))}
                {items.length === 0 && <li className="mt-2 text-xs text-faint">Sin items capturados todavía.</li>}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
