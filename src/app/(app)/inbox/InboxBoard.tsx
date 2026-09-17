'use client'

import { useMemo, useState, useTransition } from 'react'
import type { TipoTrabajo } from '@prisma/client'
import { TIPO_TRABAJO_LABEL, TIPOS_TRABAJO } from '@/lib/tipo-trabajo'
import { TourPrimeraVez } from '@/components/tour-primera-vez'
import { captureAction, crearProyectoAction, discardAction, etiquetarClasesAction } from './actions'
import { SelectConAgregar } from '@/components/select-con-agregar'
import { FiltroBandeja } from '@/components/filtro-bandeja'
import { filtrarPendientes } from '@/lib/filtrar-pendientes'

type InboxItem = {
  id: string
  titulo: string
  herramienta: string | null
  tipoTrabajo: TipoTrabajo | null
  estimadoMin: number | null
  proyecto: string | null
}

// Lo que el usuario tenía escrito antes de aceptar una sugerencia, para poder
// deshacer. Mientras hay un ajuste aplicado no se ofrece otro: encadenar factores
// multiplicaría la corrección (×1.6 sobre 96 min ya ajustados) y eso deja de ser
// el histórico para volverse inflación.
type Ajuste = { etiqueta: string; factor: number; previo: string }

export type SugerenciaClase = {
  id: string
  titulo: string
  tipo: TipoTrabajo | null
  fuente: 'historico' | 'semilla' | null
  porque: string | null
  proyecto: string | null
}

export function InboxBoard({
  tasks,
  proyectos,
  herramientas,
  factores,
  factoresClase,
  sugerencias,
}: {
  tasks: InboxItem[]
  proyectos: { id: string; nombre: string }[]
  herramientas: readonly string[]
  factores: Record<string, number>
  factoresClase: Record<TipoTrabajo, { factor: number | null; muestras: number }>
  sugerencias: SugerenciaClase[]
}) {
  const [pending, startTransition] = useTransition()
  // UN solo filtro para las dos listas de la pantalla. Tener uno por lista
  // dejaría el lote hablando de un recorte distinto al que se está leyendo, y
  // "Confirmar clases" escribiría sobre filas fuera de la vista.
  //
  // Los chips se arman con TODO el backlog, no con lo visible: un chip que
  // desaparece al filtrar no es un filtro, es un laberinto.
  const [buscar, setBuscar] = useState('')
  const [proyectoFiltro, setProyectoFiltro] = useState<string | null>(null)
  const filtro = { texto: buscar, proyecto: proyectoFiltro }
  const tasksVisibles = filtrarPendientes(tasks, filtro)
  const sugerenciasVisibles = filtrarPendientes(sugerencias, filtro)
  const [titulo, setTitulo] = useState('')
  const [herramienta, setHerramienta] = useState('')
  // Un proyecto recién creado tiene que aparecer seleccionado sin esperar a que
  // el servidor revalide.
  const [proyectosLocal, setProyectosLocal] = useState(proyectos)

  async function crearYSeleccionar(nombre: string) {
    const creado = await crearProyectoAction(nombre)
    if (!creado) return
    setProyectosLocal((l) => (l.some((x) => x.id === creado.id) ? l : [...l, creado]))
    setProjectId(creado.id)
  }
  const [tipoTrabajo, setTipoTrabajo] = useState<TipoTrabajo | ''>('')
  const [projectId, setProjectId] = useState('')
  const [aliado, setAliado] = useState(false)
  const [estimadoMin, setEstimadoMin] = useState('')
  const [ajuste, setAjuste] = useState<Ajuste | null>(null)
  // Clases del lote, editables antes de confirmar: la sugerencia se puede
  // corregir tarea por tarea o descartar entera. Arranca de las sugerencias del
  // servidor y no se re-deriva en el cliente.
  const [lote, setLote] = useState<Record<string, TipoTrabajo | ''>>({})
  const [loteAbierto, setLoteAbierto] = useState(false)

  const base = Number(estimadoMin)
  const baseValida = estimadoMin !== '' && Number.isFinite(base) && base > 0

  const claseStats = tipoTrabajo ? factoresClase[tipoTrabajo] : undefined
  const sugerenciaClase = useMemo(() => {
    if (!claseStats?.factor || !baseValida) return null
    return { factor: claseStats.factor, minutos: Math.round(base * claseStats.factor) }
  }, [claseStats, base, baseValida])

  const factorHerramienta = herramienta ? factores[herramienta] : undefined
  const sugerenciaHerramienta = useMemo(() => {
    if (!factorHerramienta || !baseValida) return null
    return { factor: factorHerramienta, minutos: Math.round(base * factorHerramienta) }
  }, [factorHerramienta, base, baseValida])

  function reset() {
    setTitulo('')
    setHerramienta('')
    setTipoTrabajo('')
    setProjectId('')
    setAliado(false)
    setEstimadoMin('')
    setAjuste(null)
  }

  function aplicar(etiqueta: string, factor: number, minutos: number) {
    setAjuste({ etiqueta, factor, previo: estimadoMin })
    setEstimadoMin(String(minutos))
  }

  function deshacer() {
    if (!ajuste) return
    setEstimadoMin(ajuste.previo)
    setAjuste(null)
  }

  // Lo que el botón de lote va a escribir de verdad, contado antes de tocarlo.
  const cuantasPorEtiquetar = sugerenciasVisibles.filter((s) => (lote[s.id] ?? s.tipo ?? '') !== '').length

  function submit() {
    if (!titulo.trim()) return
    // El estimado se manda tal como quedó en el campo. La sugerencia del histórico
    // nunca se aplica sola: si el número viene ajustado es porque el usuario apretó
    // "Usar", y ese es justo el punto — el factor solo corrige la falacia de
    // planeación si se ve y se acepta en el momento de estimar.
    startTransition(() =>
      void captureAction({
        titulo,
        herramienta: herramienta || undefined,
        tipoTrabajo: tipoTrabajo || undefined,
        projectId: projectId || undefined,
        estimadoMin: baseValida ? base : undefined,
        alcance: aliado ? 'aliado' : 'sow',
      })
    )
    reset()
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold text-ink">📥 Actividades</h1>
        <TourPrimeraVez
          ruta="/inbox"
          bullets={[
            'Captura aquí lo que va llegando suelto — correos, encargos de junta, ideas. No decides cuándo lo haces: eso pasa después, al agendarlo en Mi Día o al planear la semana.',
            <>
              El <strong>tipo de trabajo</strong> alimenta tu factor de realismo por clase: con 3 tareas medidas de la
              misma clase, la app empieza a corregirte el estimado en vez de dejarte repetir el error.
            </>,
          ]}
        />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="space-y-3 rounded-lg border border-edge bg-surface p-4"
      >
        <input
          type="text"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Descripción de la tarea…"
          disabled={pending}
          className="w-full rounded-md border border-hair px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
        />

        <div className="grid grid-cols-2 gap-2">
          <SelectConAgregar
            valor={herramienta}
            onValor={(v) => {
              setHerramienta(v)
              // El ajuste vigente se calculó con la herramienta anterior:
              // encadenarlo sobre otra sería inflación, no corrección.
              setAjuste(null)
            }}
            opciones={herramientas.map((h) => ({ valor: h, texto: h }))}
            etiqueta="Herramienta"
            vacio="Herramienta…"
            textoAgregar="+ Otra herramienta…"
            placeholderNuevo="¿Cuál?"
            disabled={pending}
            className="min-h-11 rounded-md border border-hair px-2 text-sm text-ink"
          />

          <SelectConAgregar
            valor={projectId}
            onValor={(v) => {
              if (v === '' || proyectosLocal.some((pr) => pr.id === v)) setProjectId(v)
              else void crearYSeleccionar(v)
            }}
            opciones={proyectosLocal.map((pr) => ({ valor: pr.id, texto: pr.nombre }))}
            etiqueta="Proyecto"
            vacio="Sin proyecto"
            textoAgregar="+ Nuevo proyecto…"
            placeholderNuevo="Nombre del proyecto"
            disabled={pending}
            className="min-h-11 rounded-md border border-hair px-2 text-sm text-ink"
          />

          <select
            value={tipoTrabajo}
            onChange={(e) => {
              setTipoTrabajo(e.target.value as TipoTrabajo | '')
              setAjuste(null)
            }}
            disabled={pending}
            aria-label="Tipo de trabajo"
            className="rounded-md border border-hair px-2 py-2 text-sm text-ink"
          >
            <option value="">Tipo de trabajo…</option>
            {TIPOS_TRABAJO.map((t) => (
              <option key={t} value={t}>
                {TIPO_TRABAJO_LABEL[t]}
              </option>
            ))}
          </select>
        </div>

        {projectId && (
          <label className="flex items-center gap-2 text-xs font-medium text-muted">
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
            onChange={(e) => {
              setEstimadoMin(e.target.value)
              setAjuste(null)
            }}
            placeholder="Estimado en minutos…"
            disabled={pending}
            aria-label="Estimado en minutos"
            className="num w-full rounded-md border border-hair px-3 py-2 text-sm text-ink"
          />

          {ajuste && (
            <p className="mt-1 text-xs text-muted">
              Ajustado con tu histórico en <strong>{ajuste.etiqueta}</strong>{' '}
              (<span className="num">×{ajuste.factor.toFixed(1)}</span>) ·{' '}
              <button type="button" onClick={deshacer} disabled={pending} className="underline hover:text-ink">
                deshacer
              </button>
            </p>
          )}

          {!ajuste && tipoTrabajo && sugerenciaClase && (
            <p className="mt-1 text-xs text-brand-strong">
              Tu histórico en <strong>{TIPO_TRABAJO_LABEL[tipoTrabajo]}</strong>:{' '}
              <span className="num">×{sugerenciaClase.factor.toFixed(1)}</span> → ~
              <span className="num">{sugerenciaClase.minutos}</span> min.{' '}
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  aplicar(TIPO_TRABAJO_LABEL[tipoTrabajo], sugerenciaClase.factor, sugerenciaClase.minutos)
                }
                className="font-semibold underline hover:text-brand-deep"
              >
                Usar
              </button>
            </p>
          )}

          {/* La clase de referencia manda sobre la herramienta: el tipo de trabajo
              es la variable que la evidencia dice que explica la desviación. La de
              herramienta solo aparece cuando no hay factor de clase. */}
          {!ajuste && !sugerenciaClase && sugerenciaHerramienta && (
            <p className="mt-1 text-xs text-brand-strong">
              Tu histórico en <strong>{herramienta}</strong>:{' '}
              <span className="num">×{sugerenciaHerramienta.factor.toFixed(1)}</span> → ~
              <span className="num">{sugerenciaHerramienta.minutos}</span> min.{' '}
              <button
                type="button"
                disabled={pending}
                onClick={() => aplicar(herramienta, sugerenciaHerramienta.factor, sugerenciaHerramienta.minutos)}
                className="font-semibold underline hover:text-brand-deep"
              >
                Usar
              </button>
            </p>
          )}

          {/* Sin muestras suficientes no se sugiere, pero sí se dice por qué: el
              silencio se leería como "aquí no te desvías", que es lo contrario. */}
          {!ajuste && tipoTrabajo && claseStats?.factor === null && claseStats.muestras > 0 && (
            <p className="mt-1 text-xs text-faint">
              <span className="num">{claseStats.muestras} de 3</span> tareas de {TIPO_TRABAJO_LABEL[tipoTrabajo]} medidas
              — aún sin histórico suficiente para sugerir.
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={pending || !titulo.trim()}
          className="w-full rounded-md bg-brand px-4 py-2 text-sm font-semibold text-sobre-brand hover:bg-brand-strong disabled:opacity-50"
        >
          Agregar a pendientes
        </button>
      </form>

      {tasks.length > 0 && (
        <div className="mb-4">
          <FiltroBandeja
            items={tasks}
            texto={buscar}
            onTexto={setBuscar}
            proyecto={proyectoFiltro}
            onProyecto={setProyectoFiltro}
            visibles={tasksVisibles.length}
          />
        </div>
      )}

      {/* ── Clases en lote ────────────────────────────────────────────────────
          El factor por clase solo calibra si las tareas traen clase, y etiquetar
          una por una es la disciplina PMO que esta app existe para no hacer a
          mano. La sugerencia se propone; confirmar es del humano. */}
      {sugerencias.length > 0 && (
        <section className="bloque mb-4 p-3">
          <button
            onClick={() => setLoteAbierto((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <span className="text-sm font-semibold text-ink">
              {sugerencias.length} {sugerencias.length === 1 ? 'pendiente' : 'pendientes'} sin clase de trabajo
              {sugerenciasVisibles.length !== sugerencias.length && (
                <span className="ml-1 font-normal text-muted">· {sugerenciasVisibles.length} con el filtro</span>
              )}
            </span>
            <span className="lbl text-[10px] text-brand-deep">{loteAbierto ? 'Cerrar' : 'Etiquetar en lote'}</span>
          </button>

          {loteAbierto && (
            <>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                La clase decide con qué factor se corrige la estimación al planear. Estas salen del título — de tu propio
                histórico cuando hay una tarea parecida, del vocabulario base cuando no. Revisa y confirma.
              </p>
              <ul className="mt-2 space-y-1">
                {sugerenciasVisibles.length === 0 && (
                  <li className="py-2 text-xs text-faint">Ninguna sin clase coincide con el filtro.</li>
                )}
                {sugerenciasVisibles.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 py-1">
                    <span className="min-w-0 flex-1 text-sm text-ink">
                      {s.titulo}
                      {s.porque && (
                        <span className="ml-1 text-xs text-faint" title={`Se parece a "${s.porque}"`}>
                          · como “{s.porque}”
                        </span>
                      )}
                    </span>
                    <select
                      value={lote[s.id] ?? s.tipo ?? ''}
                      aria-label={`Clase de ${s.titulo}`}
                      onChange={(e) => setLote((l) => ({ ...l, [s.id]: e.target.value as TipoTrabajo | '' }))}
                      className="rounded border border-edge bg-surface px-1 py-0.5 text-xs text-ink"
                    >
                      <option value="">No etiquetar</option>
                      {TIPOS_TRABAJO.map((t) => (
                        <option key={t} value={t}>
                          {TIPO_TRABAJO_LABEL[t]}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
              <button
                disabled={pending || cuantasPorEtiquetar === 0}
                onClick={() => {
                  // Solo lo VISIBLE: confirmar no puede escribir sobre filas
                  // que el filtro sacó de la pantalla.
                  const pares = sugerenciasVisibles
                    .map((s) => ({ id: s.id, tipo: (lote[s.id] ?? s.tipo ?? '') as TipoTrabajo | '' }))
                    .filter((p): p is { id: string; tipo: TipoTrabajo } => p.tipo !== '')
                  if (pares.length === 0) return
                  startTransition(async () => {
                    await etiquetarClasesAction(pares)
                    setLote({})
                    setLoteAbierto(false)
                  })
                }}
                className="mt-2 min-h-11 rounded-md bg-brand-deep px-3 text-xs font-bold text-sobre-brand disabled:opacity-50"
              >
                Confirmar {cuantasPorEtiquetar} {cuantasPorEtiquetar === 1 ? 'clase' : 'clases'}
              </button>
            </>
          )}
        </section>
      )}

      <ul>
        {tasksVisibles.map((t) => (
          <li key={t.id} className="hair py-3">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium text-ink">{t.titulo}</span>
              <button
                disabled={pending}
                onClick={() => startTransition(() => void discardAction(t.id))}
                className="shrink-0 text-xs font-medium text-faint hover:text-danger"
              >
                Descartar
              </button>
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted">
              {t.herramienta && (
                <span className="rounded bg-brand-soft px-1.5 py-0.5 font-medium text-brand-deep">{t.herramienta}</span>
              )}
              {t.tipoTrabajo && (
                <span className="rounded bg-brand-soft px-1.5 py-0.5 font-medium text-brand-deep">
                  {TIPO_TRABAJO_LABEL[t.tipoTrabajo]}
                </span>
              )}
              {t.proyecto && (
                <span className="rounded bg-brand-soft px-1.5 py-0.5 font-medium text-brand-deep">{t.proyecto}</span>
              )}
              {t.estimadoMin != null && <span className="num">{t.estimadoMin} min</span>}
            </div>
          </li>
        ))}
        {/* El estado vacío enseña, no informa: "sin actividades" es cierto y no
            sirve de nada la primera vez que alguien abre la pantalla. */}
        {tasks.length === 0 && (
          <li className="rounded-lg border border-dashed border-edge bg-surface p-4 text-sm">
            <p className="font-semibold text-muted">Nada pendiente por triagear.</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Aquí se acumula lo que aparece entre juntas y correos, antes de decidir qué día lo haces. Captúralo arriba
              con una descripción; si ya lo sabes, agrega el tipo de trabajo y los minutos que crees que toma. Lo que
              guardes aparece en <strong>Mi Día</strong>, en la columna de pendientes, listo para arrastrarlo a un día.
            </p>
          </li>
        )}
      </ul>
    </div>
  )
}
