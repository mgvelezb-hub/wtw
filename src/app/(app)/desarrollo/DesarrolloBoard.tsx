'use client'

import { Fragment, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import type {
  DesarrolloView,
  CompetenciaOpcion,
  HistorialRiesgos,
  CompetenciaCobertura,
  EslabonEscalafon,
  PatronNivel,
  ReactivoPatron,
} from './service'
import { registrarEvidenciaAction, cerrarRiesgoAction, reabrirRiesgoAction } from './actions'
import type { PropuestaView } from './literatura-service'
import { listarPropuestasAction, registrarPropuestaAction, actualizarPropuestaAction } from './literatura-actions'
import { AyudaContextual } from '@/components/ayuda-contextual'
import { CampoEnLinea } from '@/components/inline-controls'

type BitacoraSerializada = {
  tareas: Array<{ id: string; titulo: string; nota: string | null; minutosReales: number; proyecto: string | null }>
  minutosTotales: number
  desde: string | null
}

// Espejo local de UMBRAL_PATRON (service.ts). No se importa el valor porque
// service.ts arrastra prisma: este archivo es 'use client' y solo puede tomar
// tipos de ahí. Si cambia el umbral, cambia en los dos lados.
const UMBRAL = 3

// Vocabulario visual del lenguaje "instrumento": los controles son la misma
// pieza en toda la página, así que viven como constantes en vez de repetirse.
const BTN_SECUNDARIO =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-edge bg-surface px-4 text-[13px] font-semibold text-brand-deep transition-colors hover:border-brand hover:text-brand disabled:opacity-40'
const ICONO_RECURSO: Record<string, string> = {
  libro: '📕',
  curso: '🎓',
  platica: '🎤',
  articulo: '📄',
  ejercicio: '🔁',
}

const BTN_PRIMARIO =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-[13px] font-semibold text-surface transition-colors hover:bg-brand-strong disabled:opacity-40'
const BTN_MINI =
  'rounded-md border border-hair px-2 py-1 text-[11px] font-semibold text-muted transition-colors hover:border-brand hover:text-brand disabled:opacity-40'
const CAMPO =
  'w-full rounded-lg border border-edge bg-surface px-3 py-2 text-sm text-ink transition-colors focus:border-brand focus:outline-none'

function horas(min: number): string {
  if (min <= 0) return '0h'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`
}

// Sección colapsada del pie: ya no es una card, es una fila de hairline. Lo que
// estaba abajo de la página seguía siendo material de consulta —se abre cuando
// se busca, no se recorre— y ese es exactamente el peso visual que merece.
function Seccion({
  titulo,
  resumen,
  contador,
  defaultAbierto = false,
  children,
}: {
  titulo: string
  resumen?: React.ReactNode
  contador?: number
  defaultAbierto?: boolean
  children: React.ReactNode
}): React.ReactElement {
  const [abierto, setAbierto] = useState(defaultAbierto)

  return (
    <section className="border-b border-hair">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center justify-between gap-3 py-3 text-left text-[13px] text-muted transition-colors hover:text-ink"
      >
        <span className="min-w-0">
          <span className="font-medium text-ink">{titulo}</span>
          {resumen && <span className="text-muted"> — {resumen}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {contador !== undefined && <span className="num text-xs text-muted">{contador}</span>}
          <span className={`text-faint transition-transform ${abierto ? 'rotate-90' : ''}`} aria-hidden>
            ▸
          </span>
        </span>
      </button>
      {abierto && <div className="pb-5">{children}</div>}
    </section>
  )
}

// Sub-acordeón para agrupar los huecos por rubro dentro de la sección de
// Huecos — evita la lista plana de 41 reactivos amontonados. Mismo lenguaje de
// hairlines que la fila que lo contiene, un escalón más adentro.
function SubSeccionRubro({
  rubro,
  competencias,
}: {
  rubro: string
  competencias: CompetenciaCobertura[]
}): React.ReactElement {
  const [abierto, setAbierto] = useState(false)

  return (
    <div className="border-t border-hair first:border-t-0">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center justify-between gap-2 py-2 text-left"
      >
        <span className="text-xs font-medium text-ink">{rubro}</span>
        <span className="flex shrink-0 items-center gap-2.5">
          <span className="num text-[11px] text-muted">{competencias.length}</span>
          <span className={`text-faint transition-transform ${abierto ? 'rotate-90' : ''}`} aria-hidden>
            ▸
          </span>
        </span>
      </button>
      {abierto && (
        <ul className="space-y-1 pb-2">
          {competencias.map((c) => (
            <li key={c.id} className="text-xs text-muted">
              <span className="num mr-1.5 text-faint">{c.orden}</span>
              {c.texto}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Escalafón como línea ────────────────────────────────────────────────────
// La barra de chips trataba los 8 niveles como opciones equivalentes. Es un
// camino: el actual está lleno, el objetivo está delineado, y el tramo entre
// los dos es lo único que se pinta de marca.

function Escalafon({ eslabones }: { eslabones: EslabonEscalafon[] }): React.ReactElement {
  const idxActual = eslabones.findIndex((e) => e.esActual)
  const idxObjetivo = eslabones.findIndex((e) => e.esObjetivo)
  const hayTramo = idxActual >= 0 && idxObjetivo >= 0
  const desde = hayTramo ? Math.min(idxActual, idxObjetivo) : -1
  const hasta = hayTramo ? Math.max(idxActual, idxObjetivo) : -1

  return (
    <div
      aria-label="Escalafón"
      className="flex flex-wrap items-center gap-y-2 text-[11px] uppercase tracking-[0.06em] text-faint"
    >
      {eslabones.map((e, i) => (
        <Fragment key={e.nombre}>
          <span
            className={
              e.esActual
                ? 'rounded-full bg-brand-deep px-2.5 py-[3px] font-bold text-surface'
                : e.esObjetivo
                  ? 'rounded-full border-2 border-brand px-2.5 py-[3px] font-bold text-brand-deep'
                  : ''
            }
          >
            {e.nombre}
          </span>
          {i < eslabones.length - 1 && (
            <span
              aria-hidden
              className={`mx-2.5 min-w-[10px] flex-1 ${i >= desde && i < hasta ? 'h-0.5 bg-brand' : 'h-px bg-hair'}`}
            />
          )}
        </Fragment>
      ))}
    </div>
  )
}

// ── Los reactivos del nivel objetivo, como filas de instrumento ─────────────
// El semáforo NO es de progreso: es de lectura del comité. Rojo = no existe el
// episodio, ámbar = existe pero es anécdota, verde = hay patrón. Un ámbar con 2
// piezas no está "casi"; está a una pieza de poder defenderse.

const ESTILO_SEMAFORO: Record<ReactivoPatron['semaforo'], { chip: string; lleno: string; vacio: string; etiqueta: string }> =
  {
    sin_evidencia: {
      chip: 'bg-danger-soft text-danger',
      lleno: 'bg-danger',
      vacio: 'bg-danger-soft',
      etiqueta: 'sin evidencia',
    },
    anecdota: {
      chip: 'bg-warn-soft text-warn',
      lleno: 'bg-warn-border',
      vacio: 'bg-hair',
      etiqueta: 'anécdota',
    },
    patron: {
      chip: 'bg-ok-soft text-ok',
      lleno: 'bg-ok',
      vacio: 'bg-hair',
      etiqueta: 'patrón',
    },
  }

const COLUMNAS =
  'grid grid-cols-[28px_1fr_20px] items-center gap-x-3 md:grid-cols-[36px_1fr_160px_150px_44px] md:gap-x-4'

function amplitudDe(r: ReactivoPatron): string {
  if (r.evidenciaCount === 0) return '—'
  return `${plural(r.proyectos.length, 'proyecto', 'proyectos')} · ${plural(r.testigos.length, 'testigo', 'testigos')}`
}

function FilaReactivo({ r }: { r: ReactivoPatron }): React.ReactElement {
  const [abierto, setAbierto] = useState(false)
  const estilo = ESTILO_SEMAFORO[r.semaforo]
  const llenos = Math.min(r.evidenciaCount, UMBRAL)
  const amplitud = amplitudDe(r)

  return (
    <li className="border-b border-hair last:border-b-0">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className={`${COLUMNAS} w-full px-4 py-3.5 text-left transition-colors hover:bg-paper/40 md:px-5 md:py-4`}
      >
        <span
          className={`num inline-flex h-[26px] w-[26px] items-center justify-center rounded-md text-xs font-semibold ${estilo.chip}`}
        >
          {r.orden}
        </span>

        <span className="min-w-0">
          <span className="block text-sm text-ink">{r.texto}</span>
          <span className="mt-1 flex items-center gap-2 text-[11px] text-muted md:hidden">
            <span className="num">
              {r.evidenciaCount} / {UMBRAL}
            </span>
            <span className="text-faint">·</span>
            <span>{amplitud}</span>
          </span>
        </span>

        <span className="hidden items-center gap-2 md:flex">
          <span className="flex gap-[3px]" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className={`h-2.5 w-2.5 rounded-[2px] ${i < llenos ? estilo.lleno : estilo.vacio}`} />
            ))}
          </span>
          <span className="num text-xs text-muted">
            {r.evidenciaCount} / {UMBRAL}
          </span>
        </span>

        <span className="hidden text-xs text-muted md:block">{amplitud}</span>

        <span className={`text-faint transition-transform md:text-center ${abierto ? 'rotate-90' : ''}`} aria-hidden>
          ›
        </span>
      </button>

      {abierto && (
        <div className="px-4 pb-4 md:px-5 md:pl-[60px]">
          <p className="text-xs text-muted">
            <strong className="font-semibold text-ink">{estilo.etiqueta}</strong>
            {r.evidenciaCount > 0 && (
              <>
                {' · '}
                {plural(r.evidenciaCount, 'pieza', 'piezas')}
                {' · '}
                {amplitud}
              </>
            )}
          </p>

          {r.alertas.map((a) => (
            <p key={a} className="mt-1.5 flex gap-1.5 text-xs text-warn">
              <span aria-hidden>⚠</span>
              <span>{a}</span>
            </p>
          ))}

          {r.piezas.length === 0 ? (
            <p className="mt-1.5 text-xs text-faint">
              Ninguna pieza registrada. El episodio más reciente en que lo hiciste es la primera.
            </p>
          ) : (
            <ul className="mt-2">
              {r.piezas.map((p) => (
                <li key={p.id} className="border-t border-hair py-1.5 text-xs text-muted">
                  <span className="text-ink">{p.nota}</span>
                  {p.proyecto && <span> · {p.proyecto}</span>}
                  {p.testigo && <span> · puede corroborarlo {p.testigo}</span>}
                  {p.nivelDemostrado && (
                    <span className="ml-1.5 rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-semibold text-brand-deep">
                      nivel {p.nivelDemostrado}
                    </span>
                  )}
                  <span className="num text-faint"> · hace {p.diasDesde}d</span>
                </li>
              ))}
            </ul>
          )}

          {/* La herramienta junto al hueco: el material de la Biblioteca ligado a
              ESTE reactivo, para ejercitarlo y salir a buscar la evidencia sin
              ir a pescar al catálogo (feedback de Mau 2026-08-23). */}
          {r.recursos.length > 0 && (
            <div className="mt-2.5 border-t border-hair pt-2">
              <span className="lbl text-[10px]">Para desarrollarlo</span>
              <ul className="mt-1 space-y-0.5">
                {r.recursos.map((rec) => (
                  <li key={rec.id} className="text-xs text-muted">
                    <span aria-hidden>{ICONO_RECURSO[rec.tipo] ?? '📄'} </span>
                    <a
                      href={rec.url ?? '#catalogo'}
                      {...(rec.url ? { target: '_blank', rel: 'noreferrer' } : {})}
                      className="font-medium text-brand hover:text-brand-strong hover:underline"
                    >
                      {rec.titulo}
                    </a>
                    <span className="text-faint"> — {rec.porQue}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function TablaReactivos({ patron }: { patron: PatronNivel }): React.ReactElement {
  return (
    <div className="overflow-hidden rounded-[10px] border border-edge bg-surface">
      <div className={`${COLUMNAS} border-b border-hair bg-paper/60 px-4 py-2.5 md:px-5`}>
        <span className="lbl">#</span>
        <span className="lbl">Reactivo de {patron.nombre}</span>
        <span className="lbl hidden md:block">Evidencia</span>
        <span className="lbl hidden md:block">Amplitud</span>
        <span aria-hidden />
      </div>
      <ul>
        {patron.reactivos.map((r) => (
          <FilaReactivo key={r.id} r={r} />
        ))}
      </ul>
    </div>
  )
}

// ── Log de propuestas desde literatura (reactivo 11 de Gerente) ────────────
// Es su propio bloque, self-contenido: trae su lista con `listarPropuestasAction`
// en useEffect en vez de recibirla como prop de DesarrolloBoard — mismo patrón
// que MinutaDrawer con `getMinutaExistenteAction`. Así el resto del tablero no
// se toca para alimentar esta sección.

function PropuestaCard({
  p,
  onActualizar,
  disabled,
}: {
  p: PropuestaView
  onActualizar: (id: string, cambio: { dondePropuse?: string; queParo?: string }) => void
  disabled: boolean
}): React.ReactElement {
  return (
    <li className="border-t border-hair py-2.5 first:border-t-0">
      <p className="text-sm text-ink">{p.insight}</p>
      <p className="mt-1 text-xs text-muted">
        Fuente: {p.fuente} · <span className="num">{p.fecha}</span>
      </p>
      <p className="mt-1.5 text-xs text-muted">
        Dónde la propuse: {p.dondePropuse ?? <span className="text-faint">sin registrar</span>}
        <CampoEnLinea
          icono="✎"
          titulo="Editar dónde la propuse"
          valorInicial={p.dondePropuse ?? ''}
          placeholder="Proyecto o junta"
          ancho="w-40"
          parse={(raw) => raw}
          disabled={disabled}
          className="ml-1 text-[11px] font-bold text-brand-deep"
          onSubmit={(valor) => onActualizar(p.id, { dondePropuse: String(valor) })}
        />
      </p>
      <p className="mt-1 text-xs text-muted">
        Qué pasó: {p.queParo ?? <span className="text-faint">pendiente de saber</span>}
        <CampoEnLinea
          icono="✎"
          titulo="Completar qué pasó"
          valorInicial={p.queParo ?? ''}
          placeholder="Se adoptó / se descartó / en evaluación"
          ancho="w-48"
          parse={(raw) => raw}
          disabled={disabled}
          className="ml-1 text-[11px] font-bold text-brand-deep"
          onSubmit={(valor) => onActualizar(p.id, { queParo: String(valor) })}
        />
      </p>
    </li>
  )
}

function PropuestasLiteraturaSection(): React.ReactElement {
  const [propuestas, setPropuestas] = useState<PropuestaView[] | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [insight, setInsight] = useState('')
  const [fuente, setFuente] = useState('')
  const [dondePropuse, setDondePropuse] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    listarPropuestasAction()
      .then(setPropuestas)
      .catch(() => setPropuestas([]))
  }, [])

  function refrescar(): void {
    startTransition(async () => {
      try {
        setPropuestas(await listarPropuestasAction())
      } catch {
        // La lista se queda como estaba — no vale la pena tapar la sección por un refresh fallido.
      }
    })
  }

  function actualizar(id: string, cambio: { dondePropuse?: string; queParo?: string }): void {
    setError(null)
    startTransition(async () => {
      try {
        await actualizarPropuestaAction(id, cambio)
        setPropuestas(await listarPropuestasAction())
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo actualizar la propuesta.')
      }
    })
  }

  return (
    <Seccion
      titulo="Propuestas desde literatura"
      resumen="idea → fuente → dónde la propusiste → qué pasó"
      contador={propuestas?.length ?? 0}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted">
          Es el criterio más fácil de perder en el ruido — regístralo al momento, no de memoria semanas después.
        </p>
        <AyudaContextual
          titulo="El reactivo 11 se demuestra con este registro"
          alineacion="derecha"
          ejemplo="Leíste un patrón en un libro, lo propusiste en el comité de Liverpool, y dos semanas después se adoptó."
        >
          El reactivo 11 se demuestra con este registro: idea → fuente → dónde la propusiste → qué pasó. Una
          propuesta adoptada es evidencia; regístrala también en evidencia con testigo.
        </AyudaContextual>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="lbl">Registrar propuesta</span>
        <button
          type="button"
          onClick={() => {
            setAbierto((v) => !v)
            setError(null)
          }}
          className={BTN_MINI}
        >
          {abierto ? 'Cerrar' : '+ Nueva'}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {abierto && (
        <div className="mt-2 space-y-2">
          <input
            value={insight}
            onChange={(e) => setInsight(e.target.value)}
            placeholder="La idea o patrón…"
            aria-label="Insight"
            className={CAMPO}
          />
          <input
            value={fuente}
            onChange={(e) => setFuente(e.target.value)}
            placeholder="Fuente: libro, paper, u otro proyecto…"
            aria-label="Fuente"
            className={CAMPO}
          />
          <input
            value={dondePropuse}
            onChange={(e) => setDondePropuse(e.target.value)}
            placeholder="¿Dónde la propusiste? (opcional)"
            aria-label="Dónde la propuse"
            className={CAMPO}
          />
          <button
            disabled={pending || insight.trim() === '' || fuente.trim() === ''}
            onClick={() => {
              setError(null)
              startTransition(async () => {
                try {
                  await registrarPropuestaAction({ insight, fuente, dondePropuse })
                  setInsight('')
                  setFuente('')
                  setDondePropuse('')
                  setAbierto(false)
                  setPropuestas(await listarPropuestasAction())
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'No se pudo registrar.')
                }
              })
            }}
            className={BTN_PRIMARIO}
          >
            {pending ? 'Guardando…' : 'Guardar propuesta'}
          </button>
        </div>
      )}

      {propuestas === null ? (
        <p className="mt-3 text-sm text-muted">Cargando…</p>
      ) : propuestas.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          Sin propuestas registradas. La próxima vez que una idea de un libro, un curso o de otro proyecto te lleve a
          proponer algo, regístrala aquí antes de que se pierda en el ruido.
        </p>
      ) : (
        <ul className="mt-3">
          {propuestas.map((p) => (
            <PropuestaCard key={p.id} p={p} onActualizar={actualizar} disabled={pending} />
          ))}
        </ul>
      )}

      {!abierto && propuestas !== null && propuestas.length > 0 && (
        <button type="button" onClick={refrescar} className="mt-2 text-[11px] font-bold text-faint hover:text-brand-deep">
          refrescar
        </button>
      )}
    </Seccion>
  )
}

export function DesarrolloBoard({
  view,
  opciones,
  bitacora,
  riesgos,
  pie,
}: {
  view: DesarrolloView
  opciones: CompetenciaOpcion[]
  bitacora: BitacoraSerializada
  riesgos: HistorialRiesgos
  // El bloque de material vive en otro componente pero pertenece a la misma
  // lista de hairlines del pie: se inyecta para que la lista sea una sola.
  pie?: React.ReactNode
}): React.ReactElement {
  const [abierto, setAbierto] = useState(false)
  const [competencyId, setCompetencyId] = useState('')
  const [nota, setNota] = useState('')
  const [testigo, setTestigo] = useState('')
  const [nivelDemostrado, setNivelDemostrado] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [verRubros, setVerRubros] = useState(false)
  const [pending, startTransition] = useTransition()

  const pct = view.totalReactivos > 0 ? Math.round((view.totalConEvidencia / view.totalReactivos) * 100) : 0

  const piezasTotal = view.patron ? view.patron.reactivos.reduce((s, r) => s + r.evidenciaCount, 0) : 0
  const piezasConTestigo = view.patron
    ? view.patron.reactivos.reduce((s, r) => s + r.piezas.filter((p) => p.testigo !== null && p.testigo.trim() !== '').length, 0)
    : 0

  const colorVeredicto =
    view.patron === null || view.patron.conPatron === 0
      ? 'text-danger'
      : view.patron.conPatron === view.patron.total
        ? 'text-ok'
        : 'text-warn'

  // Huecos agrupados por rubro — la usuaria pidió "difícil entender su función",
  // y una lista plana de 41 renglones era justo eso. GRUPO_INDIVIDUAL vive en
  // service.ts pero huecos ya trae `grupo: string | null`, así que el fallback
  // visual replica el que usaba la lista plana original.
  const huecosPorRubro = new Map<string, CompetenciaCobertura[]>()
  for (const c of view.huecos) {
    const clave = c.grupo ?? 'Individual'
    const lista = huecosPorRubro.get(clave)
    if (lista) {
      lista.push(c)
    } else {
      huecosPorRubro.set(clave, [c])
    }
  }

  const rubrosVisibles = verRubros ? view.grupos : view.grupos.slice(0, 4)
  const rubrosOcultos = view.grupos.length - rubrosVisibles.length

  function abrirFormulario(): void {
    setAbierto(true)
    setOk(false)
    setError(null)
  }

  function accionRiesgo(fn: () => Promise<void>): void {
    setError(null)
    startTransition(async () => {
      try {
        await fn()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo actualizar el riesgo.')
      }
    })
  }

  return (
    <div className="flex flex-col gap-7">
      {/* Cabecera = la pregunta. No "Desarrollo": lo que se viene a resolver aquí
          es si ya se opera en el siguiente nivel, y el veredicto va en la misma
          respiración que la pregunta. */}
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="lbl">
            Carrera · {view.nivelActual ?? '—'} → {view.nivelObjetivo ?? '—'}
          </div>
          <div className="flex items-start gap-1.5">
            <h1 className="text-[28px] font-semibold leading-[1.15] text-ink">
              {view.nivelObjetivo ? `¿Ya opero como ${view.nivelObjetivo}?` : '¿Ya opero en el siguiente nivel?'}
            </h1>
            <AyudaContextual
              titulo="Patrón, no anécdota"
              ejemplo="Cinco evidencias del reactivo 10, todas de Liverpool, siguen leyéndose como “le tocó una vez”."
            >
              El comité no evalúa un episodio: evalúa si YA operas en el siguiente nivel, de forma repetida. Tres piezas o
              más, de proyectos distintos y con testigos distintos, es lo que se lee como patrón. Menos de tres es
              anécdota; tres del mismo proyecto es una anécdota larga.
            </AyudaContextual>
          </div>
          {view.patron ? (
            <p className="text-sm text-muted">
              Evidencia con patrón en{' '}
              <b className={`num font-semibold ${colorVeredicto}`}>
                {view.patron.conPatron} de {view.patron.total}
              </b>{' '}
              reactivos · <span className="num">{piezasTotal}</span> piezas,{' '}
              <span className="num">{piezasConTestigo}</span> con testigo
            </p>
          ) : (
            <p className="text-sm text-muted">
              <span className="num">
                {view.totalConEvidencia} de {view.totalReactivos}
              </span>{' '}
              reactivos con evidencia (<span className="num">{pct}%</span>)
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setAbierto(!abierto)
              setOk(false)
              setError(null)
            }}
            className={BTN_SECUNDARIO}
          >
            {abierto ? 'Cerrar' : '+ Evidencia'}
          </button>
          <Link href="/desarrollo/caso" className={BTN_PRIMARIO}>
            Exportar mi caso
          </Link>
        </div>
      </header>

      {ok && (
        <p className="rounded-lg border border-hair bg-brand-soft px-3 py-2 text-sm text-brand-deep">Evidencia registrada.</p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {/* Registrar evidencia: sin card, colgado de la cabecera. Aparece donde se
          pidió y desaparece al guardar. */}
      {abierto && (
        <div className="flex flex-col gap-3 border-y border-hair py-5">
          <p className="text-xs text-muted">
            Los reactivos sin evidencia aparecen primero: llenar un hueco vale más que engordar uno que ya tiene cinco.
          </p>

          <label className="block">
            <span className="lbl">Competencia</span>
            <select
              value={competencyId}
              onChange={(e) => setCompetencyId(e.target.value)}
              aria-label="Competencia"
              className={`mt-1 ${CAMPO}`}
            >
              <option value="">Elige la competencia…</option>
              {opciones.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.vacia ? '◻ ' : '◼ '}
                  {o.etiqueta}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="lbl">Qué pasó</span>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={3}
              aria-label="Nota de evidencia"
              placeholder="Qué hiciste, cuándo, y por qué demuestra esa competencia…"
              className={`mt-1 ${CAMPO}`}
            />
          </label>

          {/* Opcionales, pero son las dos preguntas que hace el comité: quién lo
              vio, y a qué altura estabas operando. Sin testigo, la evidencia es
              tu palabra; sin nivel, no se sabe si demuestra el siguiente escalón. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="lbl">¿Quién lo puede corroborar?</span>
              <input
                value={testigo}
                onChange={(e) => setTestigo(e.target.value)}
                placeholder="Nombre del stakeholder o cliente"
                className={`mt-1 ${CAMPO}`}
              />
            </label>
            <label className="block">
              <span className="lbl">Nivel demostrado</span>
              <select
                value={nivelDemostrado}
                onChange={(e) => setNivelDemostrado(e.target.value)}
                className={`mt-1 ${CAMPO}`}
              >
                <option value="">Sin especificar</option>
                {view.escalafon.map((e) => (
                  <option key={e.nombre} value={e.nombre}>
                    {e.nombre}
                    {e.esObjetivo ? ' (objetivo)' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <button
              disabled={pending || competencyId === '' || nota.trim() === ''}
              onClick={() => {
                setError(null)
                startTransition(async () => {
                  try {
                    await registrarEvidenciaAction({ competencyId, nota, testigo, nivelDemostrado })
                    setNota('')
                    setCompetencyId('')
                    setTestigo('')
                    setNivelDemostrado('')
                    setAbierto(false)
                    setOk(true)
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'No se pudo registrar.')
                  }
                })
              }}
              className={BTN_PRIMARIO}
            >
              {pending ? 'Guardando…' : 'Guardar evidencia'}
            </button>
          </div>
        </div>
      )}

      {view.escalafon.length > 0 && <Escalafon eslabones={view.escalafon} />}

      {view.expectativasObjetivo && (
        <p className="-mt-3 text-[13px] text-muted">
          <span className="font-semibold text-ink">Lo que exige {view.nivelObjetivo}:</span> {view.expectativasObjetivo}
        </p>
      )}

      {view.patron && <TablaReactivos patron={view.patron} />}

      {view.objetivo && view.objetivo.reactivos.length === 0 && (
        <p className="flex gap-2 rounded-lg border border-warn-border/60 bg-warn-soft px-3 py-2 text-xs text-warn">
          <span aria-hidden>⚠</span>
          <span>
            El documento de VP no publica los reactivos de {view.objetivo.nombre}. En cuanto existan, se cargan en
            <code className="ml-1">prisma/seed-data/reactivos-nivel.ts</code>.
          </span>
        </p>
      )}

      {/* Siguiente paso + cobertura: dos columnas, sin cards. Una acción y una
          medición — nada más compite por la atención a esta altura de la página. */}
      <div className="grid gap-8 md:grid-cols-2 md:gap-10">
        <div className="flex flex-col gap-2.5">
          <div className="lbl">Siguiente paso</div>
          <p className="text-sm leading-relaxed text-ink">
            {view.patron?.siguientePaso ??
              (view.patron
                ? 'Ningún reactivo pide una acción inmediata: los que tienen patrón ya vienen de frentes distintos. Lo que suma ahora es sostener la cadencia y registrar con testigo.'
                : 'Sin nivel objetivo con reactivos publicados no hay caso que armar todavía. Mientras tanto, cada evidencia registrada llena un hueco de los rubros generales.')}
          </p>
          <div>
            <button type="button" onClick={abrirFormulario} className={BTN_SECUNDARIO}>
              Registrar la pieza →
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="lbl">
            Cobertura por rubro ·{' '}
            <span className="num">
              {view.totalConEvidencia} / {view.totalReactivos}
            </span>
          </div>
          <div className="grid grid-cols-[110px_1fr_44px] items-center gap-x-3 gap-y-1.5 text-xs sm:grid-cols-[150px_1fr_40px]">
            {rubrosVisibles.map((g) => {
              const gpct = g.total > 0 ? Math.round((g.conEvidencia / g.total) * 100) : 0
              return (
                <Fragment key={g.grupo}>
                  <span className="truncate text-muted" title={g.grupo}>
                    {g.grupo}
                  </span>
                  <span className="block h-1 overflow-hidden rounded-full bg-hair">
                    <span className="block h-full bg-brand" style={{ width: `${gpct}%` }} />
                  </span>
                  <span className="num text-right text-muted">
                    {g.conEvidencia}/{g.total}
                  </span>
                </Fragment>
              )
            })}
            {view.grupos.length > 4 && (
              <button
                type="button"
                onClick={() => setVerRubros((v) => !v)}
                className="col-span-3 text-left text-xs text-faint transition-colors hover:text-brand"
              >
                {verRubros ? 'Ver menos' : `+ ${rubrosOcultos} rubros más`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Lo demás: material de consulta, en el peso visual que le toca. */}
      <div className="mt-auto border-t border-hair text-[13px]">
        {view.huecos.length > 0 && (
          <Seccion
            titulo="Huecos"
            resumen={
              <>
                <span className="num">{view.huecos.length}</span> reactivos sin evidencia
              </>
            }
            contador={view.huecos.length}
          >
            <p className="text-xs text-muted">Esta es la lista de trabajo real, no la de competencias que ya dominas.</p>
            <div className="mt-2">
              {[...huecosPorRubro.entries()].map(([rubro, competencias]) => (
                <SubSeccionRubro key={rubro} rubro={rubro} competencias={competencias} />
              ))}
            </div>
          </Seccion>
        )}

        <Seccion
          titulo="Pre-mortem"
          resumen={
            <>
              <span className="num">{riesgos.total}</span> predichos · <span className="num">{riesgos.cerrados}</span>{' '}
              cerrados
            </>
          }
        >
          {riesgos.total === 0 ? (
            <p className="text-sm text-muted">
              Sin riesgos registrados todavía. El paso 5 del planeador semanal los genera; se cierran al cerrar la semana.
            </p>
          ) : (
            <>
              <dl className="grid grid-cols-3 gap-4">
                <div>
                  <dt className="lbl">Predichos</dt>
                  <dd className="num mt-0.5 text-lg font-semibold text-ink">{riesgos.total}</dd>
                </div>
                <div>
                  <dt className="lbl">Ocurrieron</dt>
                  <dd className="num mt-0.5 text-lg font-semibold text-ink">
                    {riesgos.acertados}/{riesgos.cerrados}
                  </dd>
                </div>
                <div>
                  <dt className="lbl">Defensa sirvió</dt>
                  <dd className="num mt-0.5 text-lg font-semibold text-ink">{riesgos.defensasEfectivas}</dd>
                </div>
              </dl>

              {riesgos.abiertos.length > 0 && (
                <>
                  <p className="mt-4 text-xs text-muted">
                    Cierra cada riesgo al terminar la semana. Sin cerrarlos, el historial de capacidad predictiva no se
                    llena — y es la evidencia de &ldquo;puede prever complicaciones inherentes al proyecto&rdquo;.
                  </p>
                  <ul className="mt-2">
                    {riesgos.abiertos.map((r) => (
                      <li key={r.id} className="border-t border-hair py-2.5">
                        <p className="flex gap-1.5 text-sm text-ink">
                          <span className="num text-xs text-faint">{r.isoWeek}</span>
                          <span className="text-warn" aria-hidden>
                            ⚠
                          </span>
                          <span>{r.riesgo}</span>
                        </p>
                        <p className="mt-0.5 text-xs text-muted">Defensa: {r.defensa}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <button
                            disabled={pending}
                            onClick={() => accionRiesgo(() => cerrarRiesgoAction(r.id, true, true))}
                            className={`${BTN_MINI} border-ok/50 text-ok hover:border-ok hover:text-ok`}
                          >
                            ocurrió · la defensa sirvió
                          </button>
                          <button
                            disabled={pending}
                            onClick={() => accionRiesgo(() => cerrarRiesgoAction(r.id, true, false))}
                            className={`${BTN_MINI} border-danger/50 text-danger hover:border-danger hover:text-danger`}
                          >
                            ocurrió · no sirvió
                          </button>
                          <button
                            disabled={pending}
                            onClick={() => accionRiesgo(() => cerrarRiesgoAction(r.id, false))}
                            className={BTN_MINI}
                          >
                            no ocurrió
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {riesgos.cerradosDetalle.length > 0 && (
                <ul className="mt-4 border-t border-hair pt-2">
                  {riesgos.cerradosDetalle.map((r) => (
                    <li key={r.id} className="flex items-baseline justify-between gap-2 py-1 text-xs">
                      <span className="min-w-0 text-muted">
                        <span className="num text-faint">{r.isoWeek}</span>{' '}
                        {r.ocurrio
                          ? r.defensaFunciono
                            ? '✓ ocurrió, defensa sirvió'
                            : '✕ ocurrió, defensa falló'
                          : '— no ocurrió'}
                        {' · '}
                        {r.riesgo}
                      </span>
                      <button
                        disabled={pending}
                        onClick={() => accionRiesgo(() => reabrirRiesgoAction(r.id))}
                        className="shrink-0 font-bold text-faint transition-colors hover:text-brand disabled:opacity-40"
                        title="Reabrir — vuelve a 'aún no se sabe'"
                      >
                        ↺
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Seccion>

        <PropuestasLiteraturaSection />

        <Seccion
          titulo="Bitácora de delegación"
          resumen={
            bitacora.tareas.length === 0 ? undefined : (
              <>
                <span className="num">{bitacora.tareas.length}</span> tareas ·{' '}
                <span className="num">{horas(bitacora.minutosTotales)}</span>
                {bitacora.desde && (
                  <>
                    {' '}
                    desde <span className="num">{bitacora.desde}</span>
                  </>
                )}
              </>
            )
          }
          contador={bitacora.tareas.length}
        >
          {bitacora.tareas.length === 0 ? (
            <p className="text-sm text-muted">
              Nada marcado como delegable. En Mi Día, marca las tareas que hiciste tú pero debió hacer un perfil más
              junior.
            </p>
          ) : (
            <>
              <p className="text-sm text-ink">
                <strong className="num font-semibold">{horas(bitacora.minutosTotales)}</strong> de trabajo delegable
                {bitacora.desde && <span className="text-muted"> desde {bitacora.desde}</span>} ·{' '}
                {bitacora.tareas.length} tareas
              </p>
              <p className="mt-1 text-xs text-muted">
                Esto es el caso de negocio para pedir un reporte — que es el desbloqueo de dos de las tres expectativas de{' '}
                {view.nivelObjetivo ?? 'Gerente'}.
              </p>
              <ul className="mt-2">
                {bitacora.tareas.map((t) => (
                  <li key={t.id} className="flex items-baseline justify-between gap-2 border-t border-hair py-1.5 text-sm">
                    <span className="min-w-0 text-ink">
                      {t.titulo}
                      {t.proyecto && <span className="ml-1 text-xs text-faint">· {t.proyecto}</span>}
                      {t.nota && <span className="ml-1 text-xs text-muted">— {t.nota}</span>}
                    </span>
                    <span className="num shrink-0 text-xs text-muted">{horas(t.minutosReales)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Seccion>

        <div id="catalogo">{pie}</div>
      </div>
    </div>
  )
}
