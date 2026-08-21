'use client'

import { type ReactNode, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import type { DayBlockView, PendienteView, ProyectoActivoView, StrandedBlockView } from './service'
import type { ResultadoSobrecarga } from '@/lib/carga-sostenible'
import { MinutaDrawer } from './MinutaDrawer'
import {
  startTimerAction,
  stopTimerAction,
  cancelTimerAction,
  toggleDodItemAction,
  discardDodItemAction,
  markTaskDoneAction,
  undoTaskDoneAction,
  markBlockDoneAction,
  undoBlockDoneAction,
  startDayAction,
} from './actions'
import { createManualEntryAction } from './timeentry-actions'
import { marcarDelegableAction } from '@/app/(app)/desarrollo/actions'
import { ConfirmarQuitar, CampoEnLinea } from '@/components/inline-controls'
import { AyudaContextual } from '@/components/ayuda-contextual'
import { TourPrimeraVez } from '@/components/tour-primera-vez'
import {
  scheduleTaskAction,
  moveBlockAction,
  carryToTodayAction,
  carryAllToTodayAction,
  reflowTodayAction,
  cancelMeetingAction,
  toggleBloqueanteAction,
  setBlockTimeAction,
  setBlockDurationAction,
  unscheduleBlockAction,
  reorderDayAction,
  descartarTareaAction,
  descartarPendienteAction,
} from './dnd-actions'

// Parsers compartidos por los CampoEnLinea. Devuelven null cuando el texto aún
// no es válido — eso deshabilita ✓ y pinta el borde en rojo, en vez de tragarse
// el valor en silencio como hacía el prompt.
function parseHora(raw: string): string | null {
  const t = raw.trim()
  if (!/^\d{1,2}:\d{2}$/.test(t)) return null
  const [h, m] = t.split(':').map(Number)
  if (h > 23 || m > 59) return null
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function parseMinutos(raw: string): number | null {
  const t = raw.trim()
  if (!/^\d+$/.test(t)) return null
  const n = Number(t)
  return n > 0 && n <= 1440 ? n : null
}

type Win = { posicion: number; titulo: string; estatus: string }
type DiaTab = { fecha: string; abr: string; num: string }
type StartTransitionFn = (fn: () => void) => void

export type DiaBoardProps = {
  isoWeek: string
  rango: string
  factorUsado: number
  desbloqueador: string | null
  wins: Win[]
  trabajable: number
  carga: number
  colchon: number
  pct: number
  tabs: DiaTab[]
  selectedDay: string
  today: string
  selectedLabel: string
  blocks: DayBlockView[]
  planeadoMin: number
  realMin: number
  factorDia: number | null
  libresHoy: number
  capacidadHoy: number
  pendientes: PendienteView[]
  stranded: StrandedBlockView[]
  proyectosActivos: ProyectoActivoView[]
  sobrecarga: ResultadoSobrecarga
}

// Calm tech: en verde no se muestra nada — la ausencia de alarma no necesita
// anuncio. En ámbar/rojo, un chip junto a Factor realismo con la explicación
// de qué señales están activas y la única recomendación accionable.
function ChipSobrecarga({ sobrecarga }: { sobrecarga: ResultadoSobrecarga }) {
  if (sobrecarga.nivel === 'verde') return null
  const esRojo = sobrecarga.nivel === 'rojo'
  return (
    <span
      className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${
        esRojo ? 'bg-danger-soft text-danger' : 'bg-warn-soft text-warn'
      }`}
    >
      {esRojo ? 'Carga: en espiral' : 'Carga: al límite'}
      <AyudaContextual
        titulo="Semáforo de sobrecarga"
        alineacion="derecha"
        ejemplo="Antes de aceptar algo nuevo, corre /wtw-comprometer — o recorta en el planeador."
      >
        {sobrecarga.senales
          .filter((s) => s.activa)
          .map((s) => s.detalle)
          .join(' ')}
      </AyudaContextual>
    </span>
  )
}

// Bloques donde tiene sentido capturar una minuta: juntas internas del
// tablero, y CalendarEvents bloqueantes (las informativas no lo necesitan).
function esCandidataMinuta(b: DayBlockView): boolean {
  return b.tipo === 'junta' || (b.externa && b.bloqueante)
}

function fmt(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.floor(totalSeconds % 60)
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

function horas(min: number): string {
  if (min < 60) return `${Math.round(min)}min`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m === 0 ? `${h}H` : `${h}H${String(m).padStart(2, '0')}`
}

function liveSeconds(b: DayBlockView, tickMs: number | null): number {
  if (tickMs === null || !b.runningSince) return b.accumulatedSeconds
  return b.accumulatedSeconds + (tickMs - new Date(b.runningSince).getTime()) / 1000
}

function nowHHMM(tickMs: number): string {
  const d = new Date(tickMs)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const DIA_ABR = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MES_ABR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// Opciones válidas para "Mover a…" / "Agendar a…": nunca un día que ya pasó
// (imposible), máximo 7 días hacia adelante desde hoy.
function moveTargets(todayStr: string): DiaTab[] {
  const base = new Date(todayStr)
  const out: DiaTab[] = []
  for (let i = 0; i <= 7; i++) {
    const d = new Date(base)
    d.setUTCDate(d.getUTCDate() + i)
    out.push({
      fecha: d.toISOString().slice(0, 10),
      abr: DIA_ABR[d.getUTCDay()],
      num: `${d.getUTCDate()} ${MES_ABR[d.getUTCMonth()]}`,
    })
  }
  return out
}

// Pastel de fondo + el color del proyecto como texto — mismo patrón de contraste
// que el tablero original (fill suave + texto saturado, no outline sobre blanco).
function pillStyle(color: string): React.CSSProperties {
  return { backgroundColor: `${color}1f`, borderColor: `${color}55`, color }
}

function ProyectoBadge({ proyecto }: { proyecto: NonNullable<DayBlockView['proyecto']> }) {
  return (
    <span
      className="rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={pillStyle(proyecto.color)}
    >
      {proyecto.nombre}
    </span>
  )
}

export function DiaBoard(p: DiaBoardProps) {
  const [tick, setTick] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()
  const [verTerminadas, setVerTerminadas] = useState(false)
  const [verCanceladas, setVerCanceladas] = useState(false)
  const [minutaBlock, setMinutaBlock] = useState<DayBlockView | null>(null)

  useEffect(() => {
    setTick(Date.now())
    const id = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const esHoy = p.selectedDay === p.today
  const moveOptions = moveTargets(p.today)
  const nowStr = tick !== null ? nowHHMM(tick) : null
  // Una junta cuenta como "terminada" también cuando ya pasó su hora de fin —
  // no hace falta marcarla a mano, solo libera el campo visual sola. Una junta
  // cancelada es su propio grupo, separado de lo que de verdad se completó.
  const pasoHora = (b: DayBlockView) => b.externa && esHoy && !!nowStr && b.fin <= nowStr
  const canceladas = p.blocks.filter((b) => b.externa && b.done)
  const terminadas = [...p.blocks.filter((b) => (!b.externa && b.done) || (b.externa && !b.done && pasoHora(b)))].sort(
    (a, b) => a.fin.localeCompare(b.fin)
  )
  const activos = p.blocks.filter((b) => !canceladas.includes(b) && !terminadas.includes(b))

  return (
    // Modo trabajo en iPad. Bajo lg los dos wrappers son `display:contents`:
    // no generan caja, así que sus hijos apilan directo en el flex del
    // contenedor y `order-*` los deja en el MISMO orden de siempre
    // (hero → header → wins/capacidad → días → arrastradas → bloques →
    // pendientes). Desde lg sí son cajas: 2/3 de timeline y 1/3 de contexto
    // pegajoso, y el `order-*` queda inerte porque ya no son flex items.
    <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-6 lg:grid lg:grid-cols-3 lg:items-start">
      <div className="contents lg:col-span-2 lg:block lg:space-y-5">
        <RunningHero
          blocks={activos}
          tick={tick}
          esHoy={esHoy}
          selectedLabel={p.selectedLabel}
          pending={pending}
          startTransition={startTransition}
        />

        <header>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-strong">
            Semana ISO {p.isoWeek.split('-W')[1]} · Jornada 09–18
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-2xl font-bold text-brand-deep">{p.rango}</h1>
            <TourPrimeraVez
              ruta="/dia"
              bullets={[
                'Tus bloques de hoy, en el orden en que los vas a hacer. Un bloque es un rato reservado para una tarea o una junta.',
                <>
                  <strong>▶</strong> arranca el cronómetro de un bloque; <strong>⋯</strong> tiene el resto de las acciones
                  —mover de día, cambiar la hora, capturar la minuta, descartar.
                </>,
                'Al final del día, Cierre te pregunta qué pasó de verdad: qué se hizo, qué no y por qué. De ahí salen los pendientes del día siguiente.',
              ]}
            />
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-deep">
                Factor realismo {p.factorUsado.toFixed(1)}
              </span>
              <ChipSobrecarga sobrecarga={p.sobrecarga} />
              {p.desbloqueador && (
                <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-brand-deep">
                  ⚡ {p.desbloqueador}
                </span>
              )}
              {esHoy && (
                <>
                  <button
                    disabled={pending}
                    onClick={() => startTransition(() => void startDayAction())}
                    className="rounded-full border border-brand-deep px-3 py-1 text-xs font-bold text-brand-deep hover:bg-brand-soft"
                  >
                    ▶ Arrancar día
                  </button>
                  {/* Ya NO mueve nada aquí. Mover primero borraba la evidencia de
                      lo planeado; ahora esto lleva al cierre, donde se registra qué
                      pasó y de ahí se pasan los pendientes. */}
                  <Link
                    href={`/cierre?dia=${p.today}`}
                    title="Registrar qué pasó hoy y pasar los pendientes al siguiente día hábil"
                    className="rounded-full border border-brand-deep px-3 py-1 text-xs font-bold text-brand-deep hover:bg-brand-soft"
                  >
                    Cerrar el día →
                  </Link>
                </>
              )}
            </div>
          </div>
        </header>

        <div className="order-2 flex gap-2 overflow-x-auto">
          {p.tabs.map((t) => {
            const active = t.fecha === p.selectedDay
            return (
              <Link
                key={t.fecha}
                href={`/dia?dia=${t.fecha}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const data = e.dataTransfer.getData('text/plain')
                  if (data.startsWith('block:')) startTransition(() => void moveBlockAction(data.slice(6), t.fecha))
                  else if (data.startsWith('pend:')) startTransition(() => void scheduleTaskAction(data.slice(5), t.fecha))
                }}
                className={`flex shrink-0 flex-col items-center rounded-lg border px-4 py-2 text-sm font-medium ${
                  active ? 'border-brand-deep bg-brand-deep text-white' : 'border-neutral-200 bg-white text-neutral-700'
                }`}
              >
                <span className="font-bold">{t.abr}</span>
                <span className="text-xs opacity-90">{t.num}</span>
              </Link>
            )
          })}
        </div>

        {esHoy && p.stranded.length > 0 && (
          <div className="order-2 rounded-lg border border-warn-border bg-warn-soft px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold text-warn">
                ⚠️ Tienes {p.stranded.length} tarea{p.stranded.length > 1 ? 's' : ''} de días anteriores sin terminar.
              </p>
              <button
                disabled={pending}
                onClick={() =>
                  startTransition(() => void carryAllToTodayAction(p.stranded.map((s) => s.id), p.today))
                }
                className="rounded-md bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-strong"
              >
                Llevar todo a hoy
              </button>
            </div>
            <ul className="mt-2 space-y-1">
              {p.stranded.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 text-warn">
                  <span>
                    {s.titulo} <span className="text-xs opacity-70">({s.fecha})</span>
                  </span>
                  <button
                    disabled={pending}
                    onClick={() => startTransition(() => void carryToTodayAction(s.id, p.today))}
                    className="shrink-0 text-xs font-semibold underline hover:no-underline"
                  >
                    llevar a hoy
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div
          className="order-2 space-y-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const data = e.dataTransfer.getData('text/plain')
            if (data.startsWith('pend:')) {
              e.preventDefault()
              startTransition(() => void scheduleTaskAction(data.slice(5), p.selectedDay))
            } else if (data.startsWith('block:')) {
              e.preventDefault()
              startTransition(() => void reorderDayAction(p.selectedDay, data.slice(6), null))
            }
          }}
        >
          {/* Único indicador de capacidad del día: la barra Planeado/Real absorbió
              la card grande de "Capacidad de hoy" que vivía en la columna derecha.
              Dos tarjetas midiendo lo mismo se contradecían visualmente. */}
          <div className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-5">
                <span className="text-brand-deep">
                  Planeado <strong className="text-brand-strong">{horas(p.planeadoMin)}</strong>
                </span>
                <span className="text-brand-deep">
                  Real <strong className="text-ok">{p.realMin > 0 ? horas(p.realMin) : '0M'}</strong>
                </span>
                <span className="text-brand-deep">
                  Factor del día <strong className="text-brand-strong">{p.factorDia ? p.factorDia.toFixed(2) : '—'}</strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                {esHoy && (
                  <button
                    disabled={pending}
                    onClick={() => startTransition(() => void reflowTodayAction(p.today))}
                    className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
                    title="Trae las juntas más recientes de Outlook y recorre las tareas que choquen con ellas"
                  >
                    🔄 Actualizar juntas
                  </button>
                )}
                <a
                  href="/api/v1/calendar/export"
                  className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
                >
                  📅 ICS
                </a>
              </div>
            </div>
            {esHoy &&
              (p.capacidadHoy < 0 ? (
                <p className="mt-1.5 border-t border-neutral-100 pt-1.5 text-xs font-semibold text-warn">
                  ⚠️ Sobrecargado {Math.abs(p.capacidadHoy).toFixed(1)} h de ~{p.libresHoy.toFixed(0)} h libres — quita
                  algo o muévelo a otro día.
                </p>
              ) : (
                <p className="mt-1.5 border-t border-neutral-100 pt-1.5 text-xs text-neutral-500">
                  Capacidad de hoy: <strong className="font-semibold text-brand-deep">{p.capacidadHoy.toFixed(1)} h</strong>{' '}
                  libres de ~{p.libresHoy.toFixed(0)} h
                </p>
              ))}
          </div>

          {activos.map((b) => (
            <BlockCard
              key={b.id}
              block={b}
              tick={tick}
              pending={pending}
              startTransition={startTransition}
              enVivo={esHoy}
              tabs={moveOptions}
              selectedDay={p.selectedDay}
              terminada={false}
              onAbrirMinuta={setMinutaBlock}
            />
          ))}

          {terminadas.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => setVerTerminadas((v) => !v)}
                className="flex items-center gap-1 text-xs font-bold uppercase text-neutral-500 hover:text-neutral-700"
              >
                <span>{verTerminadas ? '▾' : '▸'}</span>✓ Terminadas ({terminadas.length})
              </button>
              {verTerminadas &&
                terminadas.map((b) => (
                  <BlockCard
                    key={b.id}
                    block={b}
                    tick={tick}
                    pending={pending}
                    startTransition={startTransition}
                    enVivo={esHoy}
                    tabs={moveOptions}
                    selectedDay={p.selectedDay}
                    terminada={true}
                    onAbrirMinuta={setMinutaBlock}
                  />
                ))}
            </div>
          )}

          {canceladas.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => setVerCanceladas((v) => !v)}
                className="flex items-center gap-1 text-xs font-bold uppercase text-neutral-500 hover:text-neutral-700"
              >
                <span>{verCanceladas ? '▾' : '▸'}</span>✕ Canceladas ({canceladas.length})
              </button>
              {verCanceladas &&
                canceladas.map((b) => (
                  <BlockCard
                    key={b.id}
                    block={b}
                    tick={tick}
                    pending={pending}
                    startTransition={startTransition}
                    enVivo={esHoy}
                    tabs={moveOptions}
                    selectedDay={p.selectedDay}
                    terminada={false}
                    onAbrirMinuta={setMinutaBlock}
                  />
                ))}
            </div>
          )}

          {/* El estado vacío es la primera pantalla que ve alguien nuevo: dice qué
              es un bloque y las tres formas reales de llenar el día, no solo que
              está vacío. */}
          {p.blocks.length === 0 && (
            <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-sm">
              <p className="font-semibold text-neutral-700">Este día no tiene bloques.</p>
              <p className="mt-1 leading-relaxed text-neutral-500">
                Un bloque es un rato reservado para una tarea o una junta — es lo que después cronometras y cierras.
                Tres formas de llenarlo:
              </p>
              <ul className="mt-2 space-y-1 text-neutral-500">
                <li>
                  · Arrastra un pendiente de la columna de la derecha hasta aquí, o usa <strong>+ Hoy</strong>.
                </li>
                <li>
                  ·{' '}
                  <Link href="/semana/nueva" className="font-semibold text-brand-deep underline">
                    Abre el planeador
                  </Link>{' '}
                  y arma la semana completa en los 5 pasos del ritual.
                </li>
                <li>
                  · Desde el chat, <code>/wtw-dia</code> arma el día solo.
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Contexto: se consulta, no se opera. Pegajoso y con su propio scroll
          para que Wins y Pendientes sigan a la vista mientras la timeline
          de la izquierda se recorre. */}
      <div className="contents lg:sticky lg:top-4 lg:block lg:max-h-[calc(100dvh-2rem)] lg:space-y-4 lg:overflow-y-auto lg:overscroll-contain">
        <div className="order-1 grid gap-4 md:grid-cols-2 lg:grid-cols-1">
          <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-deep">
              🎯 Wins de la semana
              <AyudaContextual
                titulo="Wins de la semana"
                alineacion="derecha"
                ejemplo="Ej. «Entregar el modelo de transporte con los 3 escenarios corridos»."
              >
                Los 3 resultados que definiste el lunes en el planeador y que le dan sentido a la semana. Están aquí para
                contrastarlos con los bloques de hoy: si nada de lo que hiciste empuja un Win, el día se fue en lo urgente.
                Se marcan como logrados desde <strong>Mi Semana</strong>.
              </AyudaContextual>
            </h2>
            <ol className="space-y-2">
              {p.wins.map((w) => (
                <li key={w.posicion} className="flex gap-2 text-sm">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      w.estatus === 'logrado' ? 'bg-ok text-white' : 'bg-brand-soft text-brand-deep'
                    }`}
                  >
                    {w.posicion}
                  </span>
                  <span className={w.estatus === 'logrado' ? 'text-neutral-400 line-through' : 'text-neutral-800'}>
                    {w.titulo}
                  </span>
                </li>
              ))}
              {p.wins.length === 0 && <li className="text-sm text-neutral-400">Sin Wins definidos.</li>}
            </ol>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-deep">
              📐 Capacidad
              <AyudaContextual titulo="Capacidad de la semana" alineacion="derecha">
                <strong>Trabajable</strong> son las horas de la semana que quedan libres después de las juntas.{' '}
                <strong>Carga</strong> es lo que ya te comprometiste a hacer, ajustado por tu factor de realismo. El{' '}
                <strong>colchón</strong> es la resta. Si sale en negativo, la semana no cabe: hay que mover trabajo a otra
                semana o soltarlo, no apretarlo.
              </AyudaContextual>
            </h2>
            <div className="flex gap-6">
              <Stat n={p.trabajable.toFixed(0)} u="h" l="Trabajable" />
              <Stat n={p.carga.toFixed(0)} u="h" l="Carga" />
              <Stat n={`${p.colchon >= 0 ? '+' : ''}${p.colchon.toFixed(0)}`} u="h" l="Colchón" accent />
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
              <div
                className={`h-full ${p.pct > 100 ? 'bg-danger' : 'bg-brand-strong'}`}
                style={{ width: `${Math.min(100, p.pct)}%` }}
              />
            </div>
          </section>
        </div>

        <div
          className="order-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const data = e.dataTransfer.getData('text/plain')
            if (data.startsWith('block:')) {
              e.preventDefault()
              startTransition(() => void unscheduleBlockAction(data.slice(6)))
            }
          }}
        >
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-brand-deep">
            📥 Pendientes urgentes <span className="text-neutral-400">({p.pendientes.length})</span>
            <AyudaContextual titulo="Pendientes sin agendar" alineacion="derecha">
              Todo lo que capturaste en <strong>Actividades</strong> y todavía no tiene día. Arrastra una tarjeta a un
              día de la barra de arriba para agendarla, o usa <strong>+ Hoy</strong>. Al revés también: arrastrar un
              bloque ya agendado hasta aquí lo regresa a pendientes sin perderlo. El ★ marca las urgentes, que suben
              al principio de la lista.
            </AyudaContextual>
          </h3>
          <p className="mb-2 text-[10px] text-neutral-400">Arrastra un bloque agendado aquí para regresarlo a pendientes.</p>
          {/* Desde lg la columna entera ya tiene su propio scroll: un segundo
              scroll anidado aquí adentro pelearía con el de afuera. */}
          <div className="max-h-[32rem] space-y-2 overflow-y-auto lg:max-h-none lg:overflow-visible">
            {p.pendientes.map((pe) => (
              <div
                key={pe.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', `pend:${pe.id}`)}
                className={`cursor-grab rounded-lg border bg-white p-2.5 text-sm shadow-sm active:cursor-grabbing ${
                  pe.urgente ? 'border-neutral-200 border-l-4 border-l-danger' : 'border-neutral-200'
                }`}
              >
                <p className="font-medium text-neutral-900">
                  {pe.urgente && <span className="text-danger">★ </span>}
                  {pe.titulo}
                </p>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    {pe.estimadoMin != null && (
                      <span className="rounded bg-brand-soft px-1.5 py-0.5 font-semibold text-brand-deep">
                        {horas(pe.estimadoMin)}
                      </span>
                    )}
                    {pe.proyecto && <span className="font-medium text-neutral-500">{pe.proyecto}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <select
                      disabled={pending}
                      defaultValue=""
                      onChange={(e) => {
                        const fecha = e.target.value
                        e.target.value = ''
                        if (fecha) startTransition(() => void scheduleTaskAction(pe.id, fecha))
                      }}
                      className="rounded border border-neutral-300 bg-white px-1 py-0.5 text-[10px] font-medium text-neutral-600"
                    >
                      <option value="" disabled>
                        Agendar a…
                      </option>
                      {moveOptions
                        .filter((t) => t.fecha !== p.today)
                        .map((t) => (
                          <option key={t.fecha} value={t.fecha}>
                            {t.abr} {t.num}
                          </option>
                        ))}
                    </select>
                    <button
                      disabled={pending}
                      onClick={() => startTransition(() => void scheduleTaskAction(pe.id, p.today))}
                      className="rounded bg-brand px-2 py-0.5 text-[10px] font-bold text-white hover:bg-brand-strong"
                    >
                      + Hoy
                    </button>
                    <ConfirmarQuitar
                      disabled={pending}
                      onConfirm={() => startTransition(() => void descartarPendienteAction(pe.id))}
                      titulo="Ya no aplica — quitar de pendientes (no cuenta como terminada)"
                      className="rounded px-1.5 py-0.5 text-[10px] font-bold text-neutral-400 hover:bg-danger-soft hover:text-danger"
                      armedClassName="rounded bg-danger px-1.5 py-0.5 text-[10px] font-bold text-white"
                    />
                  </div>
                </div>
              </div>
            ))}
            {p.pendientes.length === 0 && (
              <p className="text-xs leading-relaxed text-neutral-400">
                Nada sin agendar. Lo que captures en{' '}
                <Link href="/inbox" className="font-semibold text-brand-deep underline">
                  Actividades
                </Link>{' '}
                aparece aquí hasta que le das día.
              </p>
            )}
          </div>
        </div>
      </div>

      {minutaBlock && (
        <MinutaDrawer
          block={minutaBlock}
          fecha={p.selectedDay}
          proyectosActivos={p.proyectosActivos}
          onClose={() => setMinutaBlock(null)}
        />
      )}
    </div>
  )
}

function Stat({ n, u, l, accent }: { n: string; u: string; l: string; accent?: boolean }) {
  return (
    <div>
      <p className={`text-2xl font-bold ${accent ? 'text-ok' : 'text-brand-deep'}`}>
        {n}
        <span className="text-sm font-medium">{u}</span>
      </p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{l}</p>
    </div>
  )
}

// Línea discreta para los estados en los que NO hay nada corriendo. El panel
// teal prominente cuesta ~90px de alto y solo se gana cuando hay un bloque
// "ahora" al que reaccionar; para "no pasa nada" basta una línea de texto.
function AvisoDiscreto({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm text-neutral-500">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-300" />
      <span>{children}</span>
    </p>
  )
}

// Hero fijo arriba: el bloque "ahora" — con cronómetro grande y controles cuando
// es una tarea en curso. Replica el .hero del tablero original (teal-900, DoD
// inline, Pausar/Terminar/Cancelar), en vez de un timer perdido dentro de la card.
function RunningHero({
  blocks,
  tick,
  esHoy,
  selectedLabel,
  pending,
  startTransition,
}: {
  blocks: DayBlockView[]
  tick: number | null
  esHoy: boolean
  selectedLabel: string
  pending: boolean
  startTransition: StartTransitionFn
}) {
  if (!esHoy) {
    return (
      <AvisoDiscreto>
        Vista de planeación de <strong className="font-semibold text-brand-deep">{selectedLabel}</strong>. El cronómetro
        en vivo funciona en el día de hoy.
      </AvisoDiscreto>
    )
  }

  const now = tick !== null ? nowHHMM(tick) : null
  const running = blocks.find((b) => b.runningSince)
  const current =
    running ?? (now ? blocks.find((b) => b.inicio !== 'flex' && b.inicio <= now && now < b.fin) : undefined)

  if (!current) {
    const next = now
      ? blocks
          .filter((b) => b.inicio !== 'flex' && b.inicio > now)
          .sort((a, b) => a.inicio.localeCompare(b.inicio))[0]
      : undefined
    return (
      <AvisoDiscreto>
        Sin bloque ahora.{' '}
        {next ? (
          <>
            Siguiente: <strong className="font-semibold text-brand-deep">{next.titulo}</strong> a las {next.inicio}.
          </>
        ) : (
          'Sin más bloques agendados hoy.'
        )}
      </AvisoDiscreto>
    )
  }

  const isTareaCronometrable = current.tipo === 'tarea' && !current.externa
  if (!isTareaCronometrable) {
    return (
      <div className="sticky top-14 z-10 rounded-xl bg-brand-deep px-5 py-4 text-white shadow-md md:top-0">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-brand-soft">
          <span className="h-2 w-2 animate-pulse rounded-full bg-ok-soft" /> Ahora · {current.inicio}–{current.fin}
        </p>
        <p className="mt-1 text-lg font-bold">
          {current.externa ? '📅 ' : ''}
          {current.titulo}
        </p>
      </div>
    )
  }

  const seconds = liveSeconds(current, tick)
  const over = seconds > current.planMin * 60
  const isRunning = !!current.runningSince

  return (
    <div className="sticky top-14 z-10 rounded-xl bg-brand-deep px-5 py-4 text-white shadow-md md:top-0">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-brand-soft">
        <span className="h-2 w-2 animate-pulse rounded-full bg-ok-soft" />
        {isRunning ? 'En curso' : 'Ahora'} · {current.inicio}–{current.fin}
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold">{current.titulo}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {current.proyecto && <ProyectoBadge proyecto={current.proyecto} />}
            {current.winPosicion && (
              <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold uppercase text-brand-deep">
                Win {current.winPosicion}
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className={`font-mono text-3xl font-bold tabular-nums ${over ? 'text-warn-border' : 'text-white'}`}>
            {fmt(seconds)}
          </p>
          <p className="text-xs font-medium text-ok-soft">de {horas(current.planMin)} planeado</p>
        </div>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
        <div
          className={`h-full ${over ? 'bg-warn-border' : 'bg-brand-soft'}`}
          style={{ width: `${Math.min(100, (seconds / (current.planMin * 60)) * 100)}%` }}
        />
      </div>
      {current.dodItems.length > 0 && (
        <ul className="mt-3 space-y-1">
          {current.dodItems.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={d.done}
                disabled={pending}
                onChange={() => startTransition(() => void toggleDodItemAction(d.id))}
              />
              <span className={d.done ? 'text-white/50 line-through' : 'text-white/95'}>{d.texto}</span>
              <button
                disabled={pending}
                onClick={() => startTransition(() => void discardDodItemAction(d.id))}
                className="text-white/40 hover:text-white/80"
                title="Descartar — ya no aplica"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {isRunning ? (
          <>
            <button
              disabled={pending}
              onClick={() => startTransition(() => void stopTimerAction())}
              className="rounded-md bg-white/15 px-3 py-1.5 text-sm font-bold text-white hover:bg-white/25"
            >
              ❚❚ Pausar
            </button>
            <Link
              href="/focus"
              className="rounded-md bg-brand-soft px-3 py-1.5 text-sm font-bold text-brand-deep hover:bg-white"
            >
              ⏱️ Modo Focus
            </Link>
            <button
              disabled={pending}
              onClick={() => startTransition(() => void markTaskDoneAction(current.taskId!))}
              className="rounded-md bg-ok px-3 py-1.5 text-sm font-bold text-white hover:bg-ok/90"
            >
              ✓ Terminar
            </button>
            <button
              disabled={pending}
              onClick={() => startTransition(() => void cancelTimerAction(current.taskId!))}
              className="rounded-md px-3 py-1.5 text-sm font-semibold text-white/70 hover:text-white"
            >
              ✕ Cancelar
            </button>
          </>
        ) : (
          <button
            disabled={pending}
            onClick={() => startTransition(() => void startTimerAction(current.taskId!))}
            className="rounded-md bg-brand px-4 py-1.5 text-sm font-bold text-white hover:bg-brand-strong"
          >
            ▶ {seconds > 0 ? 'Reanudar' : 'Iniciar'}
          </button>
        )}
      </div>
    </div>
  )
}

function MinutaBoton({ block, onAbrirMinuta }: { block: DayBlockView; onAbrirMinuta: (b: DayBlockView) => void }) {
  return (
    <button
      onClick={() => onAbrirMinuta(block)}
      className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] font-semibold text-neutral-500 hover:border-brand-strong hover:text-brand-strong"
      title="Capturar o revisar la minuta de esta junta"
    >
      {block.minutaId ? '📝 Ver minuta' : '📝 Minuta'}
    </button>
  )
}

function NudgeMinuta() {
  return (
    <span
      className="rounded-full bg-warn-soft px-2 py-0.5 text-[10px] font-bold uppercase text-warn"
      title="Esta junta terminó y no tiene minuta capturada"
    >
      ¿Minuta?
    </span>
  )
}

// Clases compartidas por las filas del menú "⋯". Se pasan también a
// ConfirmarQuitar y CampoEnLinea, que aceptan className, para que un ítem del
// menú se vea igual sin importar qué control lo implemente.
const FILA_MENU =
  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-semibold text-neutral-700 hover:bg-neutral-100 disabled:opacity-40'
const FILA_MENU_DANGER =
  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-semibold text-danger hover:bg-danger-soft disabled:opacity-40'

// Menú contextual del bloque. Sin diálogos nativos: es un popover con estado
// React que se cierra con Escape, con clic afuera o cuando un ítem actúa. Los
// controles destructivos que viven dentro siguen usando ConfirmarQuitar (dos
// clics), así que el menú NUNCA ejecuta algo irreversible con un solo clic.
function MenuBloque({
  children,
  disabled,
}: {
  children: (cerrar: () => void) => ReactNode
  disabled: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!abierto) return
    function alHacerClicAfuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false)
    }
    function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('mousedown', alHacerClicAfuera)
    document.addEventListener('keydown', alTeclear)
    return () => {
      document.removeEventListener('mousedown', alHacerClicAfuera)
      document.removeEventListener('keydown', alTeclear)
    }
  }, [abierto])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="true"
        aria-expanded={abierto}
        aria-label="Más acciones del bloque"
        title="Más acciones"
        onClick={() => setAbierto((v) => !v)}
        // Desde lg el dedo, no el mouse: 40×40 mínimo de área de toque sin
        // agrandar el glifo (el ⋯ se ve igual, solo deja de fallarse en iPad).
        className={`inline-flex items-center justify-center rounded-md px-2 py-1.5 text-sm font-bold leading-none lg:min-h-10 lg:min-w-10 ${
          abierto ? 'bg-neutral-200 text-neutral-800' : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700'
        }`}
      >
        ⋯
      </button>
      {abierto && (
        // draggable={false} + stopPropagation: la card contenedora es draggable y
        // sin esto arrastrar dentro de un input del menú inicia el drag del bloque.
        <div
          draggable={false}
          onDragStart={(e) => e.stopPropagation()}
          className="absolute right-0 top-full z-30 mt-1 w-60 space-y-0.5 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg"
        >
          {children(() => setAbierto(false))}
        </div>
      )}
    </div>
  )
}

function BotonMenu({
  onClick,
  disabled,
  titulo,
  danger,
  children,
}: {
  onClick: () => void
  disabled: boolean
  titulo?: string
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={titulo}
      onClick={onClick}
      className={danger ? FILA_MENU_DANGER : FILA_MENU}
    >
      {children}
    </button>
  )
}

function BlockCard({
  block: b,
  tick,
  pending,
  startTransition,
  enVivo,
  tabs,
  selectedDay,
  terminada,
  onAbrirMinuta,
}: {
  block: DayBlockView
  tick: number | null
  pending: boolean
  startTransition: StartTransitionFn
  enVivo: boolean
  tabs: DiaTab[]
  selectedDay: string
  terminada: boolean
  onAbrirMinuta: (b: DayBlockView) => void
}) {
  const candidataMinuta = esCandidataMinuta(b)
  const nudgeMinuta = candidataMinuta && terminada && !b.minutaId
  const isTarea = b.tipo === 'tarea'
  const seconds = isTarea ? liveSeconds(b, tick) : 0
  const over = isTarea && seconds > b.planMin * 60

  if (b.externa) {
    return (
      <div
        className={`rounded-lg border border-l-4 p-3 ${
          b.done
            ? 'border-neutral-200 border-l-neutral-300 bg-neutral-50'
            : 'border-neutral-200 border-l-brand-strong bg-brand-soft/40'
        }`}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 sm:flex-1">
            <p className="text-xs font-medium text-neutral-600">
              {b.inicio}–{b.fin}
              <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-neutral-500">Outlook</span>
              {!b.bloqueante && !b.done && (
                <span className="ml-2 rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-neutral-600">
                  Informativo
                </span>
              )}
            </p>
            <p className={`font-semibold break-words ${b.done ? 'text-neutral-500 line-through' : 'text-neutral-900'}`}>
              📅 {b.titulo}
            </p>
            {nudgeMinuta && (
              <div className="mt-1">
                <NudgeMinuta />
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
            {b.done ? (
              <span className="rounded bg-danger-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-danger">
                Cancelada
              </span>
            ) : (
              <>
                {candidataMinuta && <MinutaBoton block={b} onAbrirMinuta={onAbrirMinuta} />}
                {enVivo && (
                  <MenuBloque disabled={pending}>
                    {(cerrar) => (
                      <>
                        <BotonMenu
                          disabled={pending}
                          titulo="Marca si esta junta realmente ocupa tu tiempo (ej. compartida solo para visibilidad)"
                          onClick={() => {
                            cerrar()
                            startTransition(() => void toggleBloqueanteAction(b.id))
                          }}
                        >
                          {b.bloqueante ? '👁 No me bloquea' : '↺ Sí me bloquea'}
                        </BotonMenu>
                        <BotonMenu
                          disabled={pending}
                          danger
                          titulo="La junta se canceló"
                          onClick={() => {
                            cerrar()
                            startTransition(() => void cancelMeetingAction(b.id))
                          }}
                        >
                          ✕ La junta se canceló
                        </BotonMenu>
                      </>
                    )}
                  </MenuBloque>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Acción primaria contextual — una sola por bloque. El resto vive en "⋯".
  const puedeIniciar = isTarea && !b.done && !b.runningSince && enVivo
  const corriendo = isTarea && !!b.runningSince
  // Cuando la primaria es Iniciar (o el bloque corre en el hero), el toggle de
  // hecho baja al menú; si no, ✓/↺ ES la primaria.
  const primariaEsHecho = !puedeIniciar && !corriendo

  function alternarHecho() {
    startTransition(() =>
      void (b.done
        ? isTarea
          ? undoTaskDoneAction(b.taskId!)
          : undoBlockDoneAction(b.id)
        : isTarea
          ? markTaskDoneAction(b.taskId!)
          : markBlockDoneAction(b.id))
    )
  }

  return (
    <div
      draggable={!b.runningSince}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', `block:${b.id}`)}
      onDragOver={(e) => {
        if (isTarea && !b.done) e.preventDefault()
      }}
      onDrop={(e) => {
        const data = e.dataTransfer.getData('text/plain')
        if (data.startsWith('block:') && isTarea && !b.done) {
          e.preventDefault()
          e.stopPropagation()
          const draggedId = data.slice(6)
          if (draggedId !== b.id) startTransition(() => void reorderDayAction(selectedDay, draggedId, b.id))
        }
      }}
      className={`cursor-grab rounded-lg border p-3 shadow-sm active:cursor-grabbing ${
        b.fueraDeJornada && !b.done
          ? 'border-2 border-warn-border bg-warn-soft'
          : b.done
            ? 'border-neutral-200 bg-neutral-50'
            : 'border-neutral-200 bg-white'
      }`}
    >
      {/* Columna en móvil, fila desde sm: los controles nunca comprimen el título
          a una palabra por línea, que era el bug en tablet (768px). */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 sm:flex-1">
          <p className="text-xs font-medium text-neutral-500">
            {b.inicio === 'flex' ? '⋯ sin hora' : `${b.inicio}–${b.fin}`}
            {b.fueraDeJornada && !b.done && (
              <span className="ml-2 rounded border border-warn-border bg-warn-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-warn">
                Fuera de jornada
              </span>
            )}
          </p>
          <p className={`font-semibold break-words ${b.done ? 'text-neutral-500 line-through' : 'text-neutral-900'}`}>
            {b.titulo}
          </p>
          {nudgeMinuta && (
            <div className="mt-1">
              <NudgeMinuta />
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
          {candidataMinuta && <MinutaBoton block={b} onAbrirMinuta={onAbrirMinuta} />}
          {isTarea && !b.runningSince && (
            <span className={`font-mono text-sm font-semibold ${over ? 'text-danger' : 'text-ok'}`}>
              {fmt(seconds)}
              <span className="text-xs font-medium text-neutral-400"> / {horas(b.planMin)}</span>
            </span>
          )}

          {corriendo ? (
            <span className="rounded-full bg-brand-soft px-2 py-1 text-xs font-bold text-brand-deep">⏱ en el hero</span>
          ) : puedeIniciar ? (
            <button
              disabled={pending}
              onClick={() => startTransition(() => void startTimerAction(b.taskId!))}
              className="inline-flex items-center justify-center rounded-md bg-brand px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-strong lg:min-h-10"
            >
              ▶ Iniciar
            </button>
          ) : (
            <button
              disabled={pending}
              onClick={alternarHecho}
              title={b.done ? 'Deshacer — regresar a pendiente' : 'Marcar terminada'}
              aria-label={b.done ? 'Deshacer terminada' : 'Marcar terminada'}
              className="inline-flex items-center justify-center rounded-md bg-neutral-100 px-2.5 py-1.5 text-sm font-bold text-neutral-700 hover:bg-neutral-200 lg:min-h-10 lg:min-w-10"
            >
              {b.done ? '↺' : '✓'}
            </button>
          )}

          <MenuBloque disabled={pending}>
            {(cerrar) => (
              <>
                {!primariaEsHecho && (
                  <BotonMenu
                    disabled={pending}
                    titulo={b.done ? 'Deshacer — regresar a pendiente' : 'Marcar terminada'}
                    onClick={() => {
                      cerrar()
                      alternarHecho()
                    }}
                  >
                    {b.done ? '↺ Deshacer terminada' : '✓ Marcar terminada'}
                  </BotonMenu>
                )}

                {isTarea && !b.done && !b.runningSince && enVivo && (
                  <div className={FILA_MENU}>
                    <span>🕐 Cambiar hora</span>
                    <CampoEnLinea
                      icono="✎"
                      titulo="Cambiar hora de inicio (HH:MM)"
                      valorInicial={b.inicio === 'flex' ? '09:00' : b.inicio}
                      placeholder="HH:MM"
                      ancho="w-16"
                      parse={parseHora}
                      disabled={pending}
                      onSubmit={(hora) => {
                        cerrar()
                        startTransition(() => void setBlockTimeAction(b.id, String(hora)))
                      }}
                      className="ml-auto text-neutral-400 hover:text-brand-deep"
                    />
                  </div>
                )}

                {isTarea && !b.done && enVivo && (
                  <div className={FILA_MENU}>
                    <span>⏳ Ajustar duración</span>
                    <CampoEnLinea
                      icono="✎"
                      titulo="Ajustar duración planeada (minutos)"
                      valorInicial={String(b.planMin)}
                      placeholder="min"
                      ancho="w-14"
                      parse={parseMinutos}
                      disabled={pending}
                      onSubmit={(min) => {
                        cerrar()
                        startTransition(() => void setBlockDurationAction(b.id, Number(min)))
                      }}
                      className="ml-auto text-neutral-400 hover:text-brand-deep"
                    />
                  </div>
                )}

                {isTarea && !b.done && enVivo && (
                  <div className={FILA_MENU}>
                    <span>➕ Tiempo manual</span>
                    <CampoEnLinea
                      icono="✎"
                      titulo="Agregar minutos trabajados a mano"
                      placeholder="min"
                      ancho="w-14"
                      parse={parseMinutos}
                      disabled={pending}
                      onSubmit={(min) => {
                        cerrar()
                        startTransition(() => void createManualEntryAction(b.taskId!, Number(min)))
                      }}
                      className="ml-auto text-neutral-400 hover:text-brand-deep"
                    />
                  </div>
                )}

                {!b.runningSince && tabs.length > 0 && (
                  <div className={FILA_MENU}>
                    <span className="shrink-0">📅 Mover a</span>
                    <select
                      disabled={pending}
                      defaultValue=""
                      onChange={(e) => {
                        const fecha = e.target.value
                        e.target.value = ''
                        cerrar()
                        if (fecha) startTransition(() => void moveBlockAction(b.id, fecha))
                      }}
                      aria-label="Mover el bloque a otro día"
                      className="ml-auto w-24 rounded border border-neutral-300 bg-white px-1 py-0.5 text-[11px] font-medium text-neutral-600"
                    >
                      <option value="" disabled>
                        Día…
                      </option>
                      {tabs
                        .filter((t) => t.fecha !== selectedDay)
                        .map((t) => (
                          <option key={t.fecha} value={t.fecha}>
                            {t.abr} {t.num}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {isTarea && (
                  <BotonMenu
                    disabled={pending}
                    titulo={
                      b.delegable
                        ? 'Marcada como delegable — cuenta en la bitácora de Desarrollo'
                        : 'Esto lo debió hacer un perfil más junior — marcar como delegable'
                    }
                    onClick={() => {
                      cerrar()
                      startTransition(() => void marcarDelegableAction(b.taskId!, !b.delegable))
                    }}
                  >
                    {b.delegable ? '↧ Quitar marca de delegable' : '↧ Marcar como delegable'}
                  </BotonMenu>
                )}

                {isTarea && !b.done && (
                  <ConfirmarQuitar
                    disabled={pending}
                    onConfirm={() => {
                      cerrar()
                      startTransition(() => void descartarTareaAction(b.id))
                    }}
                    titulo="Ya no aplica — quitar del día y de pendientes (no cuenta como terminada)"
                    icono="✕ Ya no aplica — quitar"
                    className={FILA_MENU_DANGER}
                    armedClassName={`${FILA_MENU_DANGER} bg-danger-soft`}
                  />
                )}
              </>
            )}
          </MenuBloque>
        </div>
      </div>

      {(b.proyecto || b.winPosicion || b.aliado || b.gerente || b.delegable) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {b.proyecto && <ProyectoBadge proyecto={b.proyecto} />}
          {b.winPosicion && (
            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold uppercase text-brand-deep">
              Win {b.winPosicion}
            </span>
          )}
          {b.aliado && (
            <span className="rounded-full bg-ok px-2 py-0.5 text-[10px] font-bold uppercase text-white">
              Valor cliente
            </span>
          )}
          {b.gerente && (
            <span className="rounded-full bg-[#5b4b8a] px-2 py-0.5 text-[10px] font-bold uppercase text-white">
              → Gerente
            </span>
          )}
          {/* El toggle vive en el menú; el estado sigue visible aquí para no
              perder la señal de "esto lo debió hacer alguien más". */}
          {b.delegable && (
            <span className="rounded-full bg-[#5b4b8a] px-2 py-0.5 text-[10px] font-bold uppercase text-white">
              ↧ Delegable
            </span>
          )}
          {b.proyecto?.tipo === 'interno' && !b.aliado && (
            <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-bold uppercase text-neutral-700">
              Interno
            </span>
          )}
        </div>
      )}

      {isTarea && !b.runningSince && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
          <div
            className={`h-full ${over ? 'bg-danger' : 'bg-brand-strong'}`}
            style={{ width: `${Math.min(100, (seconds / (b.planMin * 60)) * 100)}%` }}
          />
        </div>
      )}

      {b.dodItems.length > 0 && (
        <ul className="mt-2 space-y-1">
          {b.dodItems.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={d.done}
                disabled={pending}
                onChange={() => startTransition(() => void toggleDodItemAction(d.id))}
              />
              <span className={d.done ? 'text-neutral-400 line-through' : 'text-neutral-800'}>{d.texto}</span>
              <button
                disabled={pending}
                onClick={() => startTransition(() => void discardDodItemAction(d.id))}
                className="text-neutral-300 hover:text-danger"
                title="Descartar — ya no aplica"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
