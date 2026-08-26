'use client'

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import type { DayBlockView, PendienteView, ProyectoActivoView, StrandedBlockView } from './service'
import type { ResultadoSobrecarga } from '@/lib/carga-sostenible'
import type { Briefing } from '@/lib/briefing'
import { BriefingCard } from './BriefingCard'
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
import { createManualEntryAction, corregirTiempoMedidoAction } from './timeentry-actions'
import { crearActividadDelDiaAction, sugerirDuracionAction } from './nueva-actividad-actions'
import { delegarTareaAction, deshacerDelegacionAction } from './actions'
import { HERRAMIENTAS } from '@/app/(app)/inbox/service'
import { colocarMenu, ANCHO_MENU, type PosicionMenu } from './menu-geometria'
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

// ─────────────────────────────────────────────────────────────────────────────
// LENGUAJE VISUAL "INSTRUMENTO"
//
// Esta pantalla se lee de reojo veinte veces al día, no se contempla. Por eso ya
// no hay cards: una card con borde y sombra es un objeto que pide atención, y
// aquí NADA debe pedirla salvo el bloque de AHORA. Las secciones se separan con
// una etiqueta chica en mayúsculas (`lbl`) y una línea de 1 px (`hair`); los
// bloques del día son filas de tabla, no tarjetas; los números que se comparan en
// columna van en mono tabular (`num`) para que las cifras se alineen y el ojo
// detecte la diferencia sin leer.
//
// La única superficie blanca continua es la columna derecha de contexto, que se
// consulta pero no se opera. Todo lo demás vive sobre el papel crema.
// ─────────────────────────────────────────────────────────────────────────────

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

type Win = { id: string; posicion: number; titulo: string; estatus: string }
type DiaTab = { fecha: string; abr: string; num: string }
type StartTransitionFn = (fn: () => void) => void

// Qué se está arrastrando. Alimenta el DragOverlay y decide qué action se
// dispara al soltar — el payload ya no viaja como texto en el dataTransfer de
// HTML5 (que en Safari iOS ni siquiera existe para el dedo), sino como dato del
// draggable.
type ItemActivo = {
  kind: 'block' | 'pend'
  id: string
  titulo: string
  color?: string | null
}

// La fila gana sobre el contenedor que la contiene: "timeline" envuelve a todas
// las filas, así que si se resolviera por área siempre taparía el reorder. Se
// resuelve por puntero (lo que el dedo señala) y, cuando no hay puntero —el
// KeyboardSensor no lo tiene—, por intersección de rectángulos.
const detectarColision: CollisionDetection = (args) => {
  const porPuntero = pointerWithin(args)
  const lista = porPuntero.length > 0 ? porPuntero : rectIntersection(args)
  const especifica = lista.find((c) => c.id !== 'timeline')
  return especifica ? [especifica] : lista
}

// Pestaña de día: sigue siendo un <Link> (el clic navega igual), y además es
// zona de drop — el ref de dnd-kit va al <a> que Link rinde.
function TabDia({ t, activo }: { t: DiaTab; activo: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `tab:${t.fecha}` })
  return (
    <Link
      ref={setNodeRef}
      href={`/dia?dia=${t.fecha}`}
      className={`flex shrink-0 items-baseline gap-1.5 rounded-md px-3 py-1.5 text-xs ${
        activo ? 'bg-brand-deep font-semibold text-white' : 'text-muted hover:bg-surface'
      } ${isOver ? 'ring-1 ring-inset ring-brand' : ''}`}
    >
      <span>{t.abr}</span>
      <span className="num opacity-80">{t.num}</span>
    </Link>
  )
}

// Zona de drop genérica: resalta al pasarle un arrastre encima. Reemplaza a los
// onDragOver/onDrop de HTML5 que colgaban de estos mismos contenedores.
function ZonaDrop({
  id,
  clase,
  activaClase,
  seccion,
  children,
}: {
  id: string
  clase: string
  activaClase: string
  /** Rinde <section> en vez de <div> — la de Pendientes ya lo era. */
  seccion?: boolean
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  const className = `${clase} ${isOver ? activaClase : ''}`
  if (seccion) {
    return (
      <section ref={setNodeRef} className={className}>
        {children}
      </section>
    )
  }
  return (
    <div ref={setNodeRef} className={className}>
      {children}
    </div>
  )
}

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
  // null cuando el día seleccionado no es hoy: el briefing es del arranque, y
  // solo se arranca una vez.
  briefing: Briefing | null
}

// Calm tech: en verde no se muestra nada — la ausencia de alarma no necesita
// anuncio. En ámbar/rojo, un punto de color y una línea junto a la carga, con la
// explicación de qué señales están activas y la única recomendación accionable.
// Ya no es una píldora rellena: en la barra de estado todo es texto del mismo
// tamaño y solo cambia el color, que es lo que la gramática reserva para avisar.
function ChipSobrecarga({ sobrecarga }: { sobrecarga: ResultadoSobrecarga }) {
  if (sobrecarga.nivel === 'verde') return null
  const esRojo = sobrecarga.nivel === 'rojo'
  return (
    <span className={`flex items-center gap-1.5 ${esRojo ? 'text-danger' : 'text-warn'}`}>
      <span aria-hidden className={`h-[7px] w-[7px] shrink-0 rounded-full ${esRojo ? 'bg-danger' : 'bg-warn-border'}`} />
      {esRojo ? 'Carga en espiral' : 'Carga al límite'}
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

// Duración en formato de reloj para las columnas del instrumento: "4:00",
// "0:45". Se compara de un vistazo contra el cronómetro (que ya sale así) y
// alinea en tabular-nums, cosa que "1H30" no hacía.
function hhmm(min: number): string {
  const total = Math.max(0, Math.round(min))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function liveSeconds(b: DayBlockView, tickMs: number | null): number {
  if (tickMs === null || !b.runningSince) return b.accumulatedSeconds
  return b.accumulatedSeconds + (tickMs - new Date(b.runningSince).getTime()) / 1000
}

function nowHHMM(tickMs: number): string {
  const d = new Date(tickMs)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// El bloque "ahora": el que tiene el cronómetro corriendo gana siempre; si no
// hay ninguno, el que contiene la hora actual. Vive fuera de la franja porque la
// timeline necesita el MISMO resultado para resaltar su fila — dos cálculos
// separados podrían discrepar por un segundo y marcar dos bloques.
function bloqueActual(blocks: DayBlockView[], now: string | null): DayBlockView | undefined {
  const running = blocks.find((b) => b.runningSince)
  if (running) return running
  if (!now) return undefined
  return blocks.find((b) => b.inicio !== 'flex' && b.inicio <= now && now < b.fin)
}

const DIA_ABR = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MES_ABR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// "2026-08-21" → "Vie 21 Ago". Se parsea como medianoche UTC —igual que en
// page.tsx— así que `getUTC*` devuelve el día real sin corrimiento de zona.
function fechaCorta(fecha: string): string {
  const d = new Date(fecha)
  if (Number.isNaN(d.getTime())) return fecha
  return `${DIA_ABR[d.getUTCDay()]} ${d.getUTCDate()} ${MES_ABR[d.getUTCMonth()]}`
}

// Separador fino entre grupos de la barra de estado. Se oculta abajo de 640 px:
// cuando la barra envuelve a dos renglones, las rayitas quedan colgando al final
// de la línea y ensucian más de lo que separan.
function SepBarra() {
  return (
    <span aria-hidden className="hidden shrink-0 select-none text-hair sm:block">
      |
    </span>
  )
}

// ── Barra de estado del día ──────────────────────────────────────────────────
//
// Un solo renglón que reemplaza cinco avisos apilados: el header con el rango de
// fechas, el chip de factor, el chip de carga, el banner teal del desbloqueador y
// el banner ámbar de arrastradas. La regla de diseño es que el estado del día es
// AMBIENTAL —se consulta de reojo, no se lee— así que va en 12.5 px, en gris, y
// solo sube de tono lo que de verdad está fuera de rango (la carga en rojo si no
// cabe, el semáforo si no está en verde).
//
// Lo accionable no desaparece, se contrae: "2 arrastradas" abre el bloque
// colapsable de abajo, "1 desbloqueador" abre un popover con el texto completo.
function BarraEstadoDia({
  p,
  esHoy,
  pending,
  startTransition,
  onAbrirArrastradas,
}: {
  p: DiaBoardProps
  esHoy: boolean
  pending: boolean
  startTransition: StartTransitionFn
  onAbrirArrastradas: () => void
}) {
  const semana = (p.isoWeek.split('-W')[1] ?? p.isoWeek).replace(/^0/, '')
  // `colchon` viene del service como `planeable - carga`, así que la suma
  // reconstruye el planeable sin tocar la firma de props.
  const planeable = p.carga + p.colchon
  const excede = p.carga > planeable
  const arrastradas = esHoy ? p.stranded.length : 0

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-edge bg-surface px-4 py-2.5 text-[0.781rem] text-muted lg:px-7">
      {/* El h1 de la página: la fecha. El rango completo de la semana ya no
          necesita 2xl de tipografía — es contexto, no titular. */}
      <h1 className="font-semibold text-ink">{fechaCorta(p.selectedDay)}</h1>
      <span className="num">Semana {semana}</span>
      <span className="num">Jornada 09–18</span>
      <SepBarra />
      <span title="Factor de realismo de la semana">
        Factor <span className="num font-semibold text-brand-deep">×{p.factorUsado.toFixed(1)}</span>
      </span>
      <span>
        Carga{' '}
        <span className={`num font-semibold ${excede ? 'text-danger' : 'text-brand-deep'}`}>{p.carga.toFixed(0)} h</span>{' '}
        de <span className="num">{planeable.toFixed(0)} h</span> planeables
      </span>
      <ChipSobrecarga sobrecarga={p.sobrecarga} />

      <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {arrastradas > 0 && (
          <button type="button" onClick={onAbrirArrastradas} className="font-semibold text-warn hover:text-warn-strong">
            {arrastradas} arrastrada{arrastradas > 1 ? 's' : ''}
          </button>
        )}
        {p.desbloqueador && (
          <>
            <SepBarra />
            <span className="flex items-center gap-1 font-semibold text-brand-strong">
              1 desbloqueador
              <AyudaContextual
                titulo="Desbloqueador de la semana"
                alineacion="derecha"
                ejemplo="Se define el lunes, en el planeador. Vive aquí para recordarse sin ocupar una franja del día."
              >
                {p.desbloqueador}
              </AyudaContextual>
            </span>
          </>
        )}
        {esHoy && (
          <button
            disabled={pending}
            onClick={() => startTransition(() => void startDayAction())}
            className="font-semibold text-brand hover:text-brand-strong disabled:opacity-40"
          >
            ▶ Arrancar día
          </button>
        )}
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
      </div>
    </div>
  )
}

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

// El proyecto ya no es una píldora con su nombre completo: en una fila de
// instrumento ese bloque de color compite con el título. Queda como un punto del
// color del proyecto (identidad instantánea, ancho cero) y el nombre baja al
// renglón de metadatos en `faint`, donde se lee solo si se busca.
function PuntoProyecto({ proyecto }: { proyecto: NonNullable<DayBlockView['proyecto']> }) {
  return (
    <span
      aria-hidden
      title={proyecto.nombre}
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: proyecto.color }}
    />
  )
}

// Metadatos del bloque: proyecto, Win y las marcas de escalafón. Todo en 12 px
// `faint` detrás del título — presente, nunca protagonista. El único que
// conserva color es "Valor cliente", porque el verde ya significa eso en la
// gramática de la app.
function MetaBloque({ b }: { b: DayBlockView }) {
  const partes: ReactNode[] = []
  if (b.proyecto) partes.push(<span key="pr">{b.proyecto.nombre}</span>)
  if (b.winPosicion) partes.push(<span key="win">Win {b.winPosicion}</span>)
  if (b.aliado)
    partes.push(
      <span key="al" className="text-ok">
        Valor cliente
      </span>
    )
  if (b.gerente) partes.push(<span key="ge">→ Gerente</span>)
  if (b.delegable) partes.push(<span key="de">↧ Delegable</span>)
  // El nombre y no solo "delegada": el punto de que siga visible es saber a quién
  // perseguir, no que quede constancia de que salió de la carga.
  if (b.delegada) partes.push(<span key="dg">↦ {b.delegadoA ?? 'delegada'}</span>)
  if (b.proyecto?.tipo === 'interno' && !b.aliado) partes.push(<span key="in">Interno</span>)
  if (partes.length === 0) return null
  return (
    <span className="hidden shrink-0 text-xs text-faint sm:inline">
      {partes.map((el, i) => (
        <span key={i}>
          {' · '}
          {el}
        </span>
      ))}
    </span>
  )
}

export function DiaBoard(p: DiaBoardProps) {
  const [tick, setTick] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()
  const [verTerminadas, setVerTerminadas] = useState(false)
  const [verCanceladas, setVerCanceladas] = useState(false)
  const [minutaBlock, setMinutaBlock] = useState<DayBlockView | null>(null)
  // Cerrado por default: las arrastradas son una decisión pendiente, no una
  // alarma. El contador de la barra las abre y hace scroll hasta ellas.
  const [arrastradasAbiertas, setArrastradasAbiertas] = useState(false)
  const [activo, setActivo] = useState<ItemActivo | null>(null)

  // Mouse arrastra al instante (4 px de tolerancia para no comerse los clics de
  // los botones de la fila); en touch un toque corto scrollea la página y uno
  // sostenido de 200 ms arrastra — la convención de iOS, y lo que hace que el
  // iPad siga scrolleando con el dedo sobre la timeline.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor)
  )

  function onDragStart(e: DragStartEvent) {
    const data = e.active.data.current as ItemActivo | undefined
    if (data) setActivo(data)
  }

  function onDragEnd(e: DragEndEvent) {
    const item = e.active.data.current as ItemActivo | undefined
    const overId = e.over ? String(e.over.id) : null
    setActivo(null)
    if (!item || !overId) return

    // Otro día: la pestaña recibe tanto un bloque (mover) como un pendiente
    // (agendar), igual que antes.
    if (overId.startsWith('tab:')) {
      const fecha = overId.slice(4)
      if (item.kind === 'block') startTransition(() => void moveBlockAction(item.id, fecha))
      else startTransition(() => void scheduleTaskAction(item.id, fecha))
      return
    }

    // Sobre una fila de tarea: reordenar el día poniendo el arrastrado ANTES de
    // esa fila. Soltar un bloque sobre sí mismo no es un movimiento.
    if (overId.startsWith('fila:')) {
      if (item.kind !== 'block') {
        startTransition(() => void scheduleTaskAction(item.id, p.selectedDay))
        return
      }
      const destino = overId.slice(5)
      if (destino === item.id) return
      startTransition(() => void reorderDayAction(p.selectedDay, item.id, destino))
      return
    }

    // El contenedor de la timeline, fuera de cualquier fila: al final del día.
    if (overId === 'timeline') {
      if (item.kind === 'block') startTransition(() => void reorderDayAction(p.selectedDay, item.id, null))
      else startTransition(() => void scheduleTaskAction(item.id, p.selectedDay))
      return
    }

    // De vuelta a pendientes: desagendar el bloque sin perderlo.
    if (overId === 'pendientes' && item.kind === 'block') {
      startTransition(() => void unscheduleBlockAction(item.id))
    }
  }

  function abrirArrastradas() {
    setArrastradasAbiertas(true)
    // Un frame de espera: el <ul> no existe hasta que React repinta con el
    // estado abierto, y `scrollIntoView` sobre la sección cerrada apuntaría a
    // una caja de otra altura.
    requestAnimationFrame(() => {
      document.getElementById('arrastradas')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

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
  const actual = esHoy ? bloqueActual(activos, nowStr) : undefined

  return (
    // id estable: sin él dnd-kit numera los `aria-describedby` con un contador
    // global que difiere entre SSR y cliente — hydration mismatch.
    <DndContext
      id="dia-board"
      sensors={sensors}
      collisionDetection={detectarColision}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActivo(null)}
    >
    {/* Modo trabajo en iPad. Bajo lg los dos wrappers son `display:contents`:
        no generan caja, así que sus hijos apilan directo en el flex del
        contenedor y `order-*` los deja en el MISMO orden de siempre
        (barra → ahora → arranque → wins/capacidad → días → arrastradas →
        bloques → pendientes). Desde lg sí son cajas: la timeline a lo ancho y
        una columna fija de 340 px de contexto, y el `order-*` queda inerte
        porque ya no son flex items. */}
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 bg-paper pb-10 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-0 lg:pb-0">
      <div className="contents lg:block lg:min-w-0 lg:space-y-7 lg:pb-12">
        {/* La barra de estado es lo único pegajoso: se consulta mientras la
            timeline se recorre. La franja de AHORA ya no la acompaña — con 26 px
            de título y 44 px de cronómetro costaba media pantalla fija en iPad, y
            mientras se scrollea lo que importa es la lista, no el reloj. La barra
            sangra a los bordes de la columna para que su línea inferior corra de
            lado a lado, como la de un instrumento. */}
        <div className="sticky top-0 sm:top-14 z-20 md:top-0">
          <BarraEstadoDia
            p={p}
            esHoy={esHoy}
            pending={pending}
            startTransition={startTransition}
            onAbrirArrastradas={abrirArrastradas}
          />
        </div>

        <div className="mx-4 bloque p-4 lg:mx-7">
          <AhoraFranja
            blocks={activos}
            tick={tick}
            esHoy={esHoy}
            selectedLabel={p.selectedLabel}
            pending={pending}
            startTransition={startTransition}
          />
        </div>

        {/* Lo primero que se lee al abrir el día, justo debajo de la franja de
            AHORA. Sin `order-*`: comparte el order 0 de la barra, y entre iguales
            manda el orden del DOM — así queda inmediatamente después tanto en la
            columna de lg como en el flex apilado de abajo. */}
        {esHoy && p.briefing && (
          <div className="mx-4 bloque p-4 lg:mx-7">
            <BriefingCard briefing={p.briefing} />
          </div>
        )}

        <div className="order-2 flex gap-1 overflow-x-auto px-4 lg:px-7">
          {p.tabs.map((t) => (
            <TabDia key={t.fecha} t={t} activo={t.fecha === p.selectedDay} />
          ))}
        </div>

        {esHoy && p.stranded.length > 0 && (
          /* Antes era un banner ámbar abierto con toda la lista adentro: el
             aviso más pesado de la pantalla para algo que casi nunca se atiende
             en ese instante. Ahora es un renglón colapsable —cerrado por
             default— y quien lo abre es el contador "N arrastradas" de la barra
             de estado. Los dos botones siguen aquí, intactos. */
          <section id="arrastradas" className="order-2 mx-4 bloque p-4 text-sm lg:mx-7">
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="lbl text-warn">
                {p.stranded.length} arrastrada{p.stranded.length > 1 ? 's' : ''} de días anteriores
              </h2>
              <button
                type="button"
                onClick={() => setArrastradasAbiertas((v) => !v)}
                aria-expanded={arrastradasAbiertas}
                aria-controls="arrastradas-lista"
                className="ml-auto text-xs font-semibold text-faint hover:text-brand-deep"
              >
                {arrastradasAbiertas ? '▾ ocultar' : '▸ ver'}
              </button>
            </div>
            {arrastradasAbiertas && (
              <div id="arrastradas-lista" className="mt-2">
                <ul>
                  {p.stranded.map((s) => (
                    <li key={s.id} className="hair flex items-center justify-between gap-3 py-2 text-ink">
                      <span className="min-w-0">
                        {s.titulo} <span className="num text-xs text-faint">({s.fecha})</span>
                      </span>
                      <button
                        disabled={pending}
                        onClick={() => startTransition(() => void carryToTodayAction(s.id, p.today))}
                        className="shrink-0 text-xs font-semibold text-brand hover:text-brand-strong"
                      >
                        llevar a hoy
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  disabled={pending}
                  onClick={() =>
                    startTransition(() => void carryAllToTodayAction(p.stranded.map((s) => s.id), p.today))
                  }
                  className="mt-3 rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-strong"
                >
                  Llevar todo a hoy
                </button>
              </div>
            )}
          </section>
        )}

        <ZonaDrop id="timeline" clase="order-2 mx-4 bloque p-4 lg:mx-7" activaClase="bg-brand-soft/40">
          {/* Único indicador de capacidad del día: el renglón Planeado/Real/Libres
              absorbió la card grande de "Capacidad de hoy". Dos tarjetas midiendo
              lo mismo se contradecían visualmente. */}
          <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="lbl">Hoy</h2>
            <p className="num text-xs text-muted">
              Planeado <b className="font-medium text-ink">{hhmm(p.planeadoMin)}</b> · Real{' '}
              <b className="font-medium text-ink">{hhmm(p.realMin)}</b> · Factor{' '}
              <b className="font-medium text-ink">{p.factorDia ? p.factorDia.toFixed(2) : '—'}</b>
              {esHoy && (
                <>
                  {' · '}Libres{' '}
                  <b className={`font-medium ${p.capacidadHoy < 0 ? 'text-danger' : 'text-ink'}`}>
                    {p.capacidadHoy.toFixed(1)} h
                  </b>
                </>
              )}
            </p>
          </div>

          {esHoy && p.capacidadHoy < 0 && (
            <p className="mb-2 text-xs text-warn">
              Sobrecargado {Math.abs(p.capacidadHoy).toFixed(1)} h de ~{p.libresHoy.toFixed(0)} h libres — quita algo o
              muévelo a otro día.
            </p>
          )}

          <div>
            {activos.map((b) => (
              <FilaBloque
                key={b.id}
                block={b}
                tick={tick}
                pending={pending}
                startTransition={startTransition}
                enVivo={esHoy}
                tabs={moveOptions}
                selectedDay={p.selectedDay}
                terminada={false}
                esActual={b.id === actual?.id}
                onAbrirMinuta={setMinutaBlock}
                arrastrandose={activo?.kind === 'block' && activo.id === b.id}
              />
            ))}
            {activos.length > 0 && <div className="hair" />}
          </div>

          {/* Pie del día: lo que ya no está activo se consulta desde aquí, y las
              dos utilidades del día (traer juntas, exportar ICS) más el cierre
              viven en el mismo renglón — es el momento en que se usan. */}
          {(terminadas.length > 0 || canceladas.length > 0 || esHoy) && (
            <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.781rem] text-muted">
              {terminadas.length > 0 && (
                <button onClick={() => setVerTerminadas((v) => !v)} className="hover:text-ink">
                  {verTerminadas ? '▾' : '▸'} Terminadas <span className="num">({terminadas.length})</span>
                </button>
              )}
              {canceladas.length > 0 && (
                <button onClick={() => setVerCanceladas((v) => !v)} className="hover:text-ink">
                  {verCanceladas ? '▾' : '▸'} Canceladas <span className="num">({canceladas.length})</span>
                </button>
              )}
              <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
                {esHoy && (
                  <button
                    disabled={pending}
                    onClick={() => startTransition(() => void reflowTodayAction(p.today))}
                    className="hover:text-ink disabled:opacity-40"
                    title="Trae las juntas más recientes de Outlook y recorre las tareas que choquen con ellas"
                  >
                    Actualizar juntas
                  </button>
                )}
                <a href="/api/v1/calendar/export" className="hover:text-ink" title="Exportar el calendario en formato ICS">
                  ICS
                </a>
                {esHoy && (
                  /* Ya NO mueve nada aquí. Mover primero borraba la evidencia de
                     lo planeado; ahora esto lleva al cierre, donde se registra
                     qué pasó y de ahí se pasan los pendientes. */
                  <Link
                    href={`/cierre?dia=${p.today}`}
                    title="Registrar qué pasó hoy y pasar los pendientes al siguiente día hábil"
                    className="font-semibold text-brand hover:text-brand-strong"
                  >
                    Cerrar el día →
                  </Link>
                )}
              </span>
            </div>
          )}

          {verTerminadas && terminadas.length > 0 && (
            <div className="mt-2">
              {terminadas.map((b) => (
                <FilaBloque
                  key={b.id}
                  block={b}
                  tick={tick}
                  pending={pending}
                  startTransition={startTransition}
                  enVivo={esHoy}
                  tabs={moveOptions}
                  selectedDay={p.selectedDay}
                  terminada={true}
                  esActual={false}
                  onAbrirMinuta={setMinutaBlock}
                  arrastrandose={activo?.kind === 'block' && activo.id === b.id}
                />
              ))}
              <div className="hair" />
            </div>
          )}

          {verCanceladas && canceladas.length > 0 && (
            <div className="mt-2">
              {canceladas.map((b) => (
                <FilaBloque
                  key={b.id}
                  block={b}
                  tick={tick}
                  pending={pending}
                  startTransition={startTransition}
                  enVivo={esHoy}
                  tabs={moveOptions}
                  selectedDay={p.selectedDay}
                  terminada={false}
                  esActual={false}
                  onAbrirMinuta={setMinutaBlock}
                  arrastrandose={activo?.kind === 'block' && activo.id === b.id}
                />
              ))}
              <div className="hair" />
            </div>
          )}

          {/* El estado vacío es la primera pantalla que ve alguien nuevo: dice qué
              es un bloque y las tres formas reales de llenar el día, no solo que
              está vacío. */}
          {p.blocks.length === 0 && (
            <div className="rounded-lg border border-dashed border-hair p-6 text-sm">
              <p className="font-semibold text-ink">Este día no tiene bloques.</p>
              <p className="mt-1 leading-relaxed text-muted">
                Un bloque es un rato reservado para una tarea o una junta — es lo que después cronometras y cierras.
                Tres formas de llenarlo:
              </p>
              <ul className="mt-2 space-y-1 text-muted">
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
        </ZonaDrop>
      </div>

      {/* Contexto: se consulta, no se opera. Superficie blanca propia sobre el
          fondo gris claro, delimitada por su borde: el problema del crema no era
          el contraste, era que TODO fuera cálido y nada se distinguiera
          (feedback de Mau 2026-08-24). Columna pegajosa con su propio scroll
          para que Wins y Pendientes sigan a la vista mientras la timeline de la
          izquierda se recorre. */}
      <div className="contents lg:sticky lg:top-0 lg:block lg:h-dvh lg:space-y-4 lg:overflow-y-auto lg:overscroll-contain lg:border-l lg:border-edge lg:bg-paper lg:px-5 lg:py-6">
        <div className="order-1 grid gap-4 px-4 md:grid-cols-2 lg:grid-cols-1 lg:px-0">
          <section className="bloque p-4">
            <h2 className="lbl flex items-center gap-1.5">
              Wins de la semana
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
            <ol className="mt-2.5 space-y-2.5 text-[0.8125rem]">
              {p.wins.map((w) => {
                // El "si-entonces" solo existe para el Win que el briefing marcó
                // en riesgo — y es exactamente donde vale leerlo: el que se quedó
                // sin bloques es el que necesita su plan de contingencia.
                const enRiesgo = p.briefing?.winEnRiesgo?.posicion === w.posicion ? p.briefing.winEnRiesgo : null
                return (
                  <li key={w.posicion} className="grid grid-cols-[18px_minmax(0,1fr)] gap-2">
                    <span className={`num ${w.estatus === 'logrado' ? 'text-ok' : 'text-faint'}`}>{w.posicion}</span>
                    <span>
                      <span className={w.estatus === 'logrado' ? 'text-faint line-through' : 'text-ink'}>{w.titulo}</span>
                      {enRiesgo && (
                        <span className="mt-0.5 block text-xs text-warn">sin bloques restantes esta semana</span>
                      )}
                      {enRiesgo?.siEntonces && (
                        <span className="mt-0.5 block text-xs text-muted">{enRiesgo.siEntonces}</span>
                      )}
                    </span>
                  </li>
                )
              })}
              {p.wins.length === 0 && <li className="text-faint">Sin Wins definidos.</li>}
            </ol>
          </section>

          <section className="bloque p-4">
            <h2 className="lbl flex flex-wrap items-baseline gap-x-1.5">
              Capacidad de la semana
              <span className="text-xs font-normal normal-case tracking-normal text-faint">
                · planeable <span className="num">{(p.carga + p.colchon).toFixed(0)} h</span>
              </span>
              <AyudaContextual titulo="Capacidad de la semana" alineacion="derecha">
                <strong>Trabajable</strong> son las horas de la semana que quedan libres después de las juntas.{' '}
                <strong>Carga</strong> es lo que ya te comprometiste a hacer, ajustado por tu factor de realismo. El{' '}
                <strong>colchón</strong> es la resta. Si sale en negativo, la semana no cabe: hay que mover trabajo a otra
                semana o soltarlo, no apretarlo.
              </AyudaContextual>
            </h2>
            <div className="mt-3 flex items-baseline gap-5">
              <Cifra n={p.trabajable.toFixed(0)} u="h" l="Trabajable" />
              <Cifra n={p.carga.toFixed(0)} u="h" l="Carga" />
              <Cifra
                n={`${p.colchon >= 0 ? '+' : ''}${p.colchon.toFixed(0)}`}
                u="h"
                l="Colchón"
                alerta={p.colchon < 0}
              />
            </div>
            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-hair">
              <div
                className={`h-full ${p.pct > 100 ? 'bg-danger' : 'bg-brand-strong'}`}
                style={{ width: `${Math.min(100, p.pct)}%` }}
              />
            </div>
          </section>
        </div>

        <ZonaDrop seccion id="pendientes" clase="order-3 mx-4 bloque p-4 lg:mx-0" activaClase="ring-1 ring-inset ring-brand">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="lbl flex items-center gap-1.5">
              Pendientes <span className="num">({p.pendientes.length})</span>
              <AyudaContextual titulo="Pendientes sin agendar" alineacion="derecha">
                Todo lo que capturaste en <strong>Actividades</strong> y todavía no tiene día. Arrastra una tarjeta a un
                día de la barra de arriba para agendarla, o usa <strong>+ Hoy</strong>. Al revés también: arrastrar un
                bloque ya agendado hasta aquí lo regresa a pendientes sin perderlo. El ★ marca las urgentes, que suben
                al principio de la lista.
              </AyudaContextual>
            </h3>
            <span className="text-xs text-faint">arrastra al día</span>
          </div>
          <NuevaActividad
            fecha={p.selectedDay}
            wins={p.wins}
            proyectos={p.proyectosActivos}
            factorUsado={p.factorUsado}
            pending={pending}
            startTransition={startTransition}
          />
          {/* Desde lg la columna entera ya tiene su propio scroll: un segundo
              scroll anidado aquí adentro pelearía con el de afuera. */}
          <div className="mt-2.5 max-h-[32rem] space-y-2 overflow-y-auto text-[0.8125rem] lg:max-h-none lg:overflow-visible">
            {p.pendientes.map((pe) => (
              <PendienteCard
                key={pe.id}
                pe={pe}
                pending={pending}
                startTransition={startTransition}
                today={p.today}
                moveOptions={moveOptions}
                arrastrandose={activo?.kind === 'pend' && activo.id === pe.id}
              />
            ))}
            {p.pendientes.length === 0 && (
              <p className="text-xs leading-relaxed text-faint">
                Nada sin agendar. Lo que captures en{' '}
                <Link href="/inbox" className="font-semibold text-brand-deep underline">
                  Actividades
                </Link>{' '}
                aparece aquí hasta que le das día.
              </p>
            )}
          </div>
        </ZonaDrop>
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

    {/* El fantasma que sigue al dedo o al cursor: solo el título, del color del
        proyecto cuando lo hay. El original se queda en su sitio atenuado. */}
    <DragOverlay dropAnimation={null}>
      {activo && (
        <div
          className="max-w-[18rem] truncate rounded-md border-l-[3px] bg-surface px-2.5 py-1.5 text-[0.8125rem] font-semibold text-ink shadow-lg"
          style={{
            backgroundColor: activo.color ? `${activo.color}1f` : undefined,
            borderLeftColor: activo.color ?? 'var(--color-brand, #0a7c82)',
          }}
        >
          {activo.titulo}
        </div>
      )}
    </DragOverlay>
    </DndContext>
  )
}

// Tarjeta de pendiente. El ⋮⋮ es el ÚNICO activador táctil: así la columna se
// sigue scrolleando con el dedo sobre la tarjeta, y se arrastra tomando el
// handle. `touch-action: none` vive solo en ese glifo, nunca en la tarjeta.
function PendienteCard({
  pe,
  pending,
  startTransition,
  today,
  moveOptions,
  arrastrandose,
}: {
  pe: PendienteView
  pending: boolean
  startTransition: StartTransitionFn
  today: string
  moveOptions: DiaTab[]
  arrastrandose: boolean
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners } = useDraggable({
    id: `pend:${pe.id}`,
    data: { kind: 'pend', id: pe.id, titulo: pe.titulo } satisfies ItemActivo,
  })
  return (
    <div
      ref={setNodeRef}
      className={`cursor-grab rounded-lg border border-dashed px-3 py-2.5 active:cursor-grabbing ${
        pe.urgente ? 'border-danger/40' : 'border-hair'
      } ${arrastrandose ? 'opacity-40' : ''}`}
    >
      <div className="flex items-baseline gap-2.5">
        <span
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Arrastrar ${pe.titulo}`}
          className="relative -ml-1 shrink-0 cursor-grab select-none px-0.5 text-sm leading-none text-faint before:absolute before:-inset-2.5 before:content-[''] active:cursor-grabbing"
          style={{ touchAction: 'none' }}
        >
          ⋮⋮
        </span>
        <span className="num shrink-0 text-[0.6875rem] text-muted">
          {pe.estimadoMin != null ? hhmm(pe.estimadoMin) : '—'}
        </span>
        <span className="min-w-0 flex-1 text-ink">
          {pe.urgente && <span className="text-danger">★ </span>}
          {pe.titulo}
        </span>
        <button
          disabled={pending}
          onClick={() => startTransition(() => void scheduleTaskAction(pe.id, today))}
          className="shrink-0 text-xs font-semibold text-brand hover:text-brand-strong disabled:opacity-40"
        >
          + Hoy
        </button>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[0.6875rem]">
        {pe.proyecto && <span className="min-w-0 truncate text-faint">{pe.proyecto}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <select
            disabled={pending}
            defaultValue=""
            aria-label="Agendar el pendiente a otro día"
            onChange={(e) => {
              const fecha = e.target.value
              e.target.value = ''
              if (fecha) startTransition(() => void scheduleTaskAction(pe.id, fecha))
            }}
            className="rounded border border-edge bg-surface px-1 py-0.5 text-[0.625rem] font-medium text-muted"
          >
            <option value="" disabled>
              Agendar a…
            </option>
            {moveOptions
              .filter((t) => t.fecha !== today)
              .map((t) => (
                <option key={t.fecha} value={t.fecha}>
                  {t.abr} {t.num}
                </option>
              ))}
          </select>
          <ConfirmarQuitar
            disabled={pending}
            onConfirm={() => startTransition(() => void descartarPendienteAction(pe.id))}
            titulo="Ya no aplica — quitar de pendientes (no cuenta como terminada)"
            className="rounded px-1.5 py-0.5 text-[0.625rem] font-bold text-faint hover:bg-danger-soft hover:text-danger"
            armedClassName="rounded bg-danger px-1.5 py-0.5 text-[0.625rem] font-bold text-white"
          />
        </span>
      </div>
    </div>
  )
}

// Cifra del instrumento: número grande en mono tabular y la etiqueta abajo en
// `lbl` de 10 px. Sin card, sin borde — el número ES el objeto.
function Cifra({ n, u, l, alerta }: { n: string; u: string; l: string; alerta?: boolean }) {
  return (
    <div>
      <p className="leading-none">
        <span className={`num text-[1.625rem] font-medium ${alerta ? 'text-danger' : 'text-brand-deep'}`}>{n}</span>
        <span className="num text-xs text-faint">{u}</span>
      </p>
      <p className="lbl mt-1 text-[0.625rem]">{l}</p>
    </div>
  )
}

// Línea discreta para los estados en los que NO hay nada corriendo. La franja de
// AHORA cuesta media pantalla y solo se gana cuando hay un bloque al que
// reaccionar; para "no pasa nada" basta una línea de texto bajo la misma
// etiqueta, para que la sección no desaparezca de la retícula.
function AvisoDiscreto({ children }: { children: ReactNode }) {
  return (
    <div>
      <p className="lbl">Ahora</p>
      <p className="mt-1.5 text-sm text-muted">{children}</p>
      <div className="hair mt-3" />
    </div>
  )
}

// ── AHORA ────────────────────────────────────────────────────────────────────
//
// La franja del bloque en curso. Reemplaza al panel teal invertido: un panel
// oscuro es un objeto que grita, y esto se mira cada dos minutos. Ahora es tipo
// sobre papel —título a 26 px, cronómetro a 44 px en mono, UN botón primario— y
// el peso visual lo da el tamaño, no el color de fondo.
//
// El `sticky` ya no vive aquí ni en su contenedor: solo la barra de estado se
// queda pegada arriba.
function AhoraFranja({
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
  const current = bloqueActual(blocks, now)

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

  // El renglón de contexto del mockup: "14:30 – 18:42 · Liverpool · Win 2".
  const meta = [
    current.inicio === 'flex' ? 'sin hora fija' : `${current.inicio} – ${current.fin}`,
    current.proyecto?.nombre,
    current.winPosicion ? `Win ${current.winPosicion}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const isTareaCronometrable = current.tipo === 'tarea' && !current.externa

  // Junta o bloque no cronometrable: la misma franja, sin reloj ni controles —
  // lo único que hace falta saber es qué está pasando y hasta cuándo.
  if (!isTareaCronometrable) {
    return (
      <div>
        <p className="lbl">Ahora</p>
        <p className="num mt-2 text-[0.8125rem] text-muted">{current.externa ? `📅 ${meta}` : meta}</p>
        <p className="mt-1 text-[1.625rem] font-semibold leading-[1.15] text-balance text-ink">{current.titulo}</p>
        <div className="hair mt-3.5" />
      </div>
    )
  }

  const seconds = liveSeconds(current, tick)
  const over = seconds > current.planMin * 60
  const isRunning = !!current.runningSince

  return (
    <div>
      <p className="lbl">Ahora</p>
      <div className="mt-2 flex flex-wrap items-end gap-x-7 gap-y-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="num text-[0.8125rem] text-muted">
            {isRunning && (
              <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-brand align-middle" />
            )}
            {meta}
          </p>
          <p className="text-[1.625rem] font-semibold leading-[1.15] text-balance text-ink">{current.titulo}</p>
        </div>

        <div className="flex flex-col items-end">
          <p className="flex items-baseline gap-1.5">
            <span className={`num text-[2.75rem] font-medium leading-none ${over ? 'text-danger' : 'text-brand-deep'}`}>
              {fmt(seconds)}
            </span>
            <span className="num text-sm text-faint">/ {hhmm(current.planMin)}</span>
          </p>
          {isRunning && (
            <Link href="/focus" className="mt-1.5 text-[0.6875rem] font-semibold text-brand hover:text-brand-strong">
              modo focus →
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isRunning ? (
            <button
              disabled={pending}
              onClick={() => startTransition(() => void stopTimerAction())}
              className="flex h-11 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-40"
            >
              ❚❚ Pausar
            </button>
          ) : (
            <button
              disabled={pending}
              onClick={() => startTransition(() => void startTimerAction(current.taskId!))}
              className="flex h-11 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-40"
            >
              ▶ {seconds > 0 ? 'Reanudar' : 'Iniciar'}
            </button>
          )}
          <MenuBloque
            disabled={pending}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-hair text-base text-muted hover:bg-surface hover:text-ink"
          >
            {(cerrar) => (
              <>
                <BotonMenu
                  disabled={pending}
                  titulo="Marcar terminada"
                  onClick={() => {
                    cerrar()
                    startTransition(() => void markTaskDoneAction(current.taskId!))
                  }}
                >
                  ✓ Terminar
                </BotonMenu>
                <Link href="/focus" onClick={cerrar} className={FILA_MENU}>
                  ⏱️ Modo Focus
                </Link>
                {isRunning && (
                  <BotonMenu
                    disabled={pending}
                    danger
                    titulo="Descartar el tiempo de esta corrida"
                    onClick={() => {
                      cerrar()
                      startTransition(() => void cancelTimerAction(current.taskId!))
                    }}
                  >
                    ✕ Cancelar corrida
                  </BotonMenu>
                )}
              </>
            )}
          </MenuBloque>
        </div>
      </div>

      {current.dodItems.length > 0 && (
        <ul className="mt-3 space-y-1">
          {current.dodItems.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-[0.8125rem]">
              <input
                type="checkbox"
                checked={d.done}
                disabled={pending}
                onChange={() => startTransition(() => void toggleDodItemAction(d.id))}
              />
              <span className={d.done ? 'text-faint line-through' : 'text-ink'}>{d.texto}</span>
              <button
                disabled={pending}
                onClick={() => startTransition(() => void discardDodItemAction(d.id))}
                className="text-faint hover:text-danger"
                title="Descartar — ya no aplica"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="hair mt-3.5" />
    </div>
  )
}

function MinutaBoton({ block, onAbrirMinuta }: { block: DayBlockView; onAbrirMinuta: (b: DayBlockView) => void }) {
  return (
    <button
      onClick={() => onAbrirMinuta(block)}
      className="shrink-0 rounded px-1.5 py-1 text-[0.6875rem] font-semibold text-muted hover:text-brand-strong"
      title={block.minutaId ? 'Revisar la minuta de esta junta' : 'Capturar la minuta de esta junta'}
      aria-label={block.minutaId ? 'Ver minuta' : 'Capturar minuta'}
    >
      {block.minutaId ? '📝 minuta' : '📝'}
    </button>
  )
}

function NudgeMinuta() {
  return (
    <span className="shrink-0 text-xs font-semibold text-warn" title="Esta junta terminó y no tiene minuta capturada">
      ¿minuta?
    </span>
  )
}

// Clases compartidas por las filas del menú "⋯". Se pasan también a
// ConfirmarQuitar y CampoEnLinea, que aceptan className, para que un ítem del
// menú se vea igual sin importar qué control lo implemente.
const FILA_MENU =
  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-semibold text-ink hover:bg-paper disabled:opacity-40'
const FILA_MENU_DANGER =
  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-semibold text-danger hover:bg-danger-soft disabled:opacity-40'

// Menú contextual del bloque. Sin diálogos nativos: es un popover con estado
// React que se cierra con Escape, con clic afuera o cuando un ítem actúa. Los
// controles destructivos que viven dentro siguen usando ConfirmarQuitar (dos
// clics), así que el menú NUNCA ejecuta algo irreversible con un solo clic.
// Capturar sin salir del día. Antes había que irse a /inbox y volver, y cuando
// algo cae a media mañana —una junta que suelta trabajo— salir del día es justo
// lo que hace que no se registre. Lo que no se registra no entra en la carga
// contra la que se mide el sobre-compromiso.
//
// Arranca colapsado: es una acción ocasional, y un formulario siempre abierto en
// la columna de pendientes compite con lo que sí se mira todos los días.
const TIPOS_TRABAJO = ['deck', 'analisis', 'junta', 'gestion', 'comunicacion', 'otro'] as const

function NuevaActividad({
  fecha,
  wins,
  proyectos,
  factorUsado,
  pending,
  startTransition,
}: {
  fecha: string
  wins: Win[]
  proyectos: ProyectoActivoView[]
  factorUsado: number
  pending: boolean
  startTransition: StartTransitionFn
}) {
  const [abierto, setAbierto] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [projectId, setProjectId] = useState('')
  const [winId, setWinId] = useState('')
  const [herramienta, setHerramienta] = useState('')
  const [tipoTrabajo, setTipoTrabajo] = useState('')
  const [minutos, setMinutos] = useState('')
  const [sugiriendo, setSugiriendo] = useState(false)
  const [nota, setNota] = useState<string | null>(null)

  function limpiar() {
    setTitulo(''); setProjectId(''); setWinId(''); setHerramienta(''); setTipoTrabajo(''); setMinutos(''); setNota(null)
  }

  async function sugerir() {
    setSugiriendo(true)
    setNota(null)
    const r = await sugerirDuracionAction(titulo, herramienta || undefined, proyectos.find((p) => p.id === projectId)?.nombre)
    setSugiriendo(false)
    if (r.ok) { setMinutos(String(r.estimadoMin)); setNota(r.nota ?? null) } else setNota(r.error)
  }

  function guardar(agendar: boolean) {
    const est = minutos.trim() === '' ? undefined : Number(minutos)
    startTransition(() => {
      void crearActividadDelDiaAction({
        titulo,
        fecha,
        agendar,
        projectId: projectId || undefined,
        winId: winId || undefined,
        herramienta: herramienta || undefined,
        tipoTrabajo: (tipoTrabajo || undefined) as never,
        estimadoMin: Number.isFinite(est) ? est : undefined,
      })
    })
    limpiar()
    setAbierto(false)
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="mt-2.5 w-full rounded-md border border-dashed border-hair py-2 text-xs font-semibold text-muted hover:border-brand hover:text-brand-deep"
      >
        + Nueva actividad
      </button>
    )
  }

  const est = Number(minutos)
  const ajustado = Number.isFinite(est) && est > 0 ? Math.round(est * factorUsado) : null

  return (
    <div className="mt-2.5 space-y-2 rounded-lg border border-edge bg-paper p-2.5">
      <input
        autoFocus
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="¿Qué hay que hacer?"
        className="w-full rounded border border-hair bg-surface px-2 py-1.5 text-[0.8125rem]"
      />

      <div className="grid grid-cols-2 gap-2">
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Proyecto" className="rounded border border-hair bg-surface px-1.5 py-1 text-xs text-muted">
          <option value="">Proyecto…</option>
          {proyectos.map((pr) => <option key={pr.id} value={pr.id}>{pr.nombre}</option>)}
        </select>

        <select value={winId} onChange={(e) => setWinId(e.target.value)} aria-label="Win de la semana" className="rounded border border-hair bg-surface px-1.5 py-1 text-xs text-muted">
          <option value="">Sin Win</option>
          {wins.map((w) => <option key={w.id} value={w.id}>{w.posicion}. {w.titulo.slice(0, 30)}</option>)}
        </select>

        <select value={herramienta} onChange={(e) => setHerramienta(e.target.value)} aria-label="Herramienta" className="rounded border border-hair bg-surface px-1.5 py-1 text-xs text-muted">
          <option value="">Herramienta…</option>
          {HERRAMIENTAS.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>

        <select value={tipoTrabajo} onChange={(e) => setTipoTrabajo(e.target.value)} aria-label="Clase de trabajo" className="rounded border border-hair bg-surface px-1.5 py-1 text-xs text-muted">
          <option value="">Clase…</option>
          {TIPOS_TRABAJO.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <input
          value={minutos}
          onChange={(e) => setMinutos(e.target.value)}
          placeholder="min"
          inputMode="numeric"
          aria-label="Minutos estimados"
          className="w-16 rounded border border-hair bg-surface px-2 py-1 text-xs num"
        />
        <button
          type="button"
          disabled={sugiriendo || titulo.trim() === ''}
          onClick={() => void sugerir()}
          title="Estimar con la IA, usando tus tareas ya medidas como referencia"
          className="rounded border border-hair px-2 py-1 text-xs font-medium text-muted hover:border-brand hover:text-brand-deep disabled:opacity-40"
        >
          {sugiriendo ? 'estimando…' : '✨ Sugerir'}
        </button>
        {/* El ajustado se muestra ANTES de guardar: el factor deja de ser un
            número abstracto de la cabecera y se vuelve la consecuencia visible
            de lo que se está a punto de comprometer. */}
        {ajustado !== null && (
          <span className="text-xs text-faint">
            → <span className="num">{ajustado}</span> min con factor {factorUsado}
          </span>
        )}
      </div>

      {nota && <p className="text-xs leading-relaxed text-faint">{nota}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending || titulo.trim() === ''}
          onClick={() => guardar(true)}
          className="rounded-md bg-brand-deep px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          Agendar en este día
        </button>
        <button
          type="button"
          disabled={pending || titulo.trim() === ''}
          onClick={() => guardar(false)}
          className="rounded-md border border-hair px-2.5 py-1.5 text-xs font-medium text-muted hover:border-brand hover:text-brand-deep disabled:opacity-40"
        >
          A pendientes
        </button>
        <button type="button" onClick={() => { limpiar(); setAbierto(false) }} className="ml-auto text-xs text-faint hover:text-ink">
          cancelar
        </button>
      </div>
    </div>
  )
}

// El menú vive en un PORTAL con `position: fixed`, no como hijo absoluto de la
// fila. Dos razones, y la segunda es la que lo rompía en el último bloque del
// día:
//   1. La lista del día está dentro de contenedores con overflow, que recortan
//      cualquier hijo absoluto que se salga (mismo defecto que tuvo el popover
//      del "?", ver src/components/ayuda-contextual.tsx).
//   2. Abría SIEMPRE hacia abajo (`top-full`), así que en las últimas filas caía
//      fuera de la pantalla. Ahora se voltea hacia arriba cuando no cabe abajo,
//      y en cualquier caso se acota al viewport con scroll propio.
//
// La aritmética de dónde cae vive en ./menu-geometria.ts y se prueba sin
// navegador; aquí solo se mide el botón y el panel.
function MenuBloque({
  children,
  disabled,
  className,
}: {
  children: (cerrar: () => void) => ReactNode
  disabled: boolean
  // Solo presentación: la franja de AHORA lo pide de 44×44 con borde; en las
  // filas de la timeline es un glifo suelto en la columna de acción.
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [pos, setPos] = useState<PosicionMenu | null>(null)
  const boton = useRef<HTMLButtonElement | null>(null)
  const panel = useRef<HTMLDivElement | null>(null)

  // Se recalcula en scroll y resize mientras está abierto: con `fixed`, si la
  // página scrollea el botón se mueve y el menú no.
  useLayoutEffect(() => {
    if (!abierto) return

    function colocar() {
      const r = boton.current?.getBoundingClientRect()
      if (!r) return
      setPos(
        colocarMenu(
          { top: r.top, bottom: r.bottom, right: r.right },
          panel.current?.offsetHeight ?? 0,
          { ancho: window.innerWidth, alto: window.innerHeight }
        )
      )
    }

    colocar()
    window.addEventListener('scroll', colocar, true)
    window.addEventListener('resize', colocar)
    return () => {
      window.removeEventListener('scroll', colocar, true)
      window.removeEventListener('resize', colocar)
    }
  }, [abierto])

  useEffect(() => {
    if (!abierto) return
    function alHacerClicAfuera(e: MouseEvent) {
      const t = e.target as Node
      // El panel ya no es descendiente del botón en el DOM: hay que preguntarle
      // a los dos por separado o el primer clic dentro del menú lo cierra.
      if (boton.current?.contains(t) || panel.current?.contains(t)) return
      setAbierto(false)
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
    <div className="relative">
      <button
        ref={boton}
        type="button"
        disabled={disabled}
        aria-haspopup="true"
        aria-expanded={abierto}
        aria-label="Más acciones del bloque"
        title="Más acciones"
        onClick={() => setAbierto((v) => !v)}
        // El dedo, no el mouse: 40×40 mínimo de área de toque sin agrandar el
        // glifo (el ⋯ se ve igual, solo deja de fallarse en iPad).
        className={
          className ??
          `inline-flex h-9 w-9 items-center justify-center rounded-md text-sm leading-none lg:h-10 lg:w-10 ${
            abierto ? 'bg-hair text-ink' : 'text-faint hover:bg-surface hover:text-ink'
          }`
        }
      >
        ⋯
      </button>
      {abierto &&
        createPortal(
          // Se monta antes de tener posición para poder MEDIRLO y decidir si
          // abre hacia arriba; hasta entonces va oculto, no desplazado, para que
          // no se vea saltar. `useLayoutEffect` cierra el ciclo antes del paint.
          <div
            ref={panel}
            role="menu"
            style={{
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              maxHeight: pos?.maxHeight,
              width: ANCHO_MENU,
              visibility: pos ? 'visible' : 'hidden',
            }}
            className="fixed z-50 space-y-0.5 overflow-y-auto rounded-lg border border-edge bg-surface p-1 shadow-lg"
          >
            {children(() => setAbierto(false))}
          </div>,
          document.body
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

// Rejilla de la fila de instrumento: rango · título · duración · acción. En
// móvil el rango se acorta a la hora de inicio y la columna de duración se
// esconde (el número se cuela al final del título), para que el título nunca
// quede en una palabra por línea — que era el bug de la card en tablet.
const REJILLA_FILA =
  'grid grid-cols-[46px_minmax(0,1fr)_auto] items-center gap-x-3 sm:grid-cols-[92px_minmax(0,1fr)_60px_auto] sm:gap-x-4'

function FilaBloque({
  block: b,
  tick,
  pending,
  startTransition,
  enVivo,
  tabs,
  selectedDay,
  terminada,
  esActual,
  onAbrirMinuta,
  arrastrandose,
}: {
  block: DayBlockView
  tick: number | null
  pending: boolean
  startTransition: StartTransitionFn
  enVivo: boolean
  tabs: DiaTab[]
  selectedDay: string
  terminada: boolean
  // Solo presentación: la fila del bloque en curso se levanta del papel con la
  // superficie blanca, igual que la franja de AHORA lo nombra arriba.
  esActual: boolean
  onAbrirMinuta: (b: DayBlockView) => void
  arrastrandose: boolean
}) {
  // Los hooks van ANTES de la salida temprana de las juntas de Outlook: una
  // junta no arrastra ni recibe, y eso se expresa con `disabled`, no dejando de
  // llamar el hook.
  const isTarea = b.tipo === 'tarea'
  const { setNodeRef: setDragRef, setActivatorNodeRef, attributes, listeners } = useDraggable({
    id: `block:${b.id}`,
    disabled: b.externa || !!b.runningSince,
    data: { kind: 'block', id: b.id, titulo: b.titulo, color: b.proyecto?.color ?? null } satisfies ItemActivo,
  })
  // Soltar OTRO bloque sobre esta fila lo coloca antes que ella.
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `fila:${b.id}`,
    disabled: b.externa || !isTarea || b.done,
  })

  const candidataMinuta = esCandidataMinuta(b)
  const nudgeMinuta = candidataMinuta && terminada && !b.minutaId
  const seconds = isTarea ? liveSeconds(b, tick) : 0
  const over = isTarea && seconds > b.planMin * 60
  const apagado = b.done || terminada

  const fondo = esActual
    ? '-mx-3 rounded-md bg-surface px-3'
    : b.fueraDeJornada && !b.done
      ? '-mx-3 rounded-md bg-warn-soft px-3'
      : ''

  const rango = (
    <span
      className={`num text-xs ${esActual ? 'font-semibold text-brand-deep' : 'text-muted'}`}
      title={b.inicio === 'flex' ? 'Sin hora fija' : `${b.inicio}–${b.fin}`}
    >
      {b.inicio === 'flex' ? (
        'flex'
      ) : (
        <>
          {b.inicio}
          <span className="hidden sm:inline"> – {b.fin}</span>
        </>
      )}
    </span>
  )

  const duracion = (
    <span className="hidden text-right sm:block">
      <span className={`num block text-xs ${esActual ? 'font-semibold text-brand-deep' : 'text-muted'}`}>
        {hhmm(b.planMin)}
      </span>
      {isTarea && seconds > 0 && (
        <span className={`num block text-[0.6875rem] ${over ? 'text-danger' : 'text-ok'}`}>{fmt(seconds)}</span>
      )}
    </span>
  )

  // ── Juntas de Outlook ──────────────────────────────────────────────────────
  if (b.externa) {
    return (
      <div className={`hair py-2.5 ${fondo}`}>
        <div className={REJILLA_FILA}>
          {rango}
          <span className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded-full bg-brand-soft px-1.5 py-px text-[0.625rem] font-bold uppercase tracking-wider text-brand-deep">
              Outlook
            </span>
            <span className={`min-w-0 truncate ${apagado ? 'text-faint line-through' : 'text-ink'}`} title={b.titulo}>
              {b.titulo}
            </span>
            {!b.bloqueante && !b.done && <span className="shrink-0 text-xs text-faint">informativa</span>}
            {b.done && <span className="shrink-0 text-xs font-semibold text-danger">cancelada</span>}
            {nudgeMinuta && <NudgeMinuta />}
            <span className="num shrink-0 text-xs text-faint sm:hidden">{hhmm(b.planMin)}</span>
          </span>
          {duracion}
          <span className="flex items-center justify-end gap-1">
            {!b.done && candidataMinuta && <MinutaBoton block={b} onAbrirMinuta={onAbrirMinuta} />}
            {!b.done && enVivo && (
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
          </span>
        </div>
      </div>
    )
  }

  // Acción primaria contextual — una sola por bloque. El resto vive en "⋯".
  const puedeIniciar = isTarea && !b.done && !b.runningSince && enVivo
  const corriendo = isTarea && !!b.runningSince
  // Cuando la primaria es Iniciar (o el bloque corre en la franja de AHORA), el
  // toggle de hecho baja al menú; si no, ✓/↺ ES la primaria.
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
      ref={(node) => {
        setDragRef(node)
        setDropRef(node)
      }}
      className={`hair group py-2.5 ${fondo} ${isOver ? 'ring-1 ring-inset ring-brand' : ''} ${
        arrastrandose ? 'opacity-40' : ''
      }`}
    >
      <div className={REJILLA_FILA}>
        <span className="flex items-center gap-1">
          {/* El activador táctil: `touch-action: none` vive SOLO aquí, para que
              el resto de la fila —y con ella la página— siga scrolleando con el
              dedo en el iPad. Discreto en desktop (aparece al pasar el mouse),
              siempre visible en touch, donde no hay hover que lo revele. El
              pseudo-elemento le da ~32 px de área de toque sin ocupar un solo
              píxel más de alto: el glifo se ve igual, deja de fallarse. */}
          <span
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Arrastrar ${b.titulo}`}
            className={`relative -ml-1.5 shrink-0 select-none px-0.5 text-xs leading-none text-faint transition-opacity before:absolute before:-inset-2.5 before:content-[''] ${
              b.runningSince
                ? 'cursor-default opacity-20'
                : 'cursor-grab opacity-40 active:cursor-grabbing sm:opacity-0 sm:group-hover:opacity-100'
            }`}
            style={{ touchAction: 'none' }}
          >
            ⋮⋮
          </span>
          {rango}
        </span>

        <span className="flex min-w-0 items-center gap-2">
          {b.proyecto && <PuntoProyecto proyecto={b.proyecto} />}
          <span
            className={`min-w-0 truncate ${
              apagado ? 'text-faint line-through' : esActual ? 'font-semibold text-ink' : 'text-ink'
            }`}
            title={b.titulo}
          >
            {b.titulo}
          </span>
          <MetaBloque b={b} />
          {b.fueraDeJornada && !b.done && <span className="shrink-0 text-xs text-warn">fuera de jornada</span>}
          {nudgeMinuta && <NudgeMinuta />}
          <span className="num shrink-0 text-xs text-faint sm:hidden">{hhmm(b.planMin)}</span>
        </span>

        {duracion}

        <span className="flex items-center justify-end gap-1">
          {candidataMinuta && <MinutaBoton block={b} onAbrirMinuta={onAbrirMinuta} />}

          {corriendo ? (
            <span className="shrink-0 text-[0.6875rem] font-semibold text-brand" title="Se controla desde la franja de Ahora">
              ⏱ en curso
            </span>
          ) : puedeIniciar ? (
            <button
              disabled={pending}
              onClick={() => startTransition(() => void startTimerAction(b.taskId!))}
              title="Iniciar el cronómetro de este bloque"
              aria-label="Iniciar el cronómetro de este bloque"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-sm font-semibold text-brand hover:bg-brand-soft disabled:opacity-40 lg:h-10 lg:w-10"
            >
              ▶
            </button>
          ) : (
            <button
              disabled={pending}
              onClick={alternarHecho}
              title={b.done ? 'Deshacer — regresar a pendiente' : 'Marcar terminada'}
              aria-label={b.done ? 'Deshacer terminada' : 'Marcar terminada'}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-sm font-semibold text-muted hover:bg-surface hover:text-ink disabled:opacity-40 lg:h-10 lg:w-10"
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
                      className="ml-auto text-faint hover:text-brand-deep"
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
                      className="ml-auto text-faint hover:text-brand-deep"
                    />
                  </div>
                )}

                {/* A diferencia del resto del menú, esta fila NO se condiciona a
                    `!b.done` ni a `enVivo`: un cronómetro olvidado se descubre
                    cuando la tarea ya está terminada, y a veces días después.
                    Negarle la corrección justo entonces es lo que obligaba a
                    entrar por la base de datos. */}
                {isTarea && b.accumulatedSeconds > 0 && !b.runningSince && (
                  <div className={FILA_MENU}>
                    <span>✎ Corregir medido</span>
                    <CampoEnLinea
                      icono="⏱"
                      titulo="Cuánto duró de verdad esta tarea (minutos)"
                      valorInicial={String(Math.round(b.accumulatedSeconds / 60))}
                      placeholder="min"
                      ancho="w-14"
                      parse={parseMinutos}
                      disabled={pending}
                      onSubmit={(min) => {
                        cerrar()
                        startTransition(() => void corregirTiempoMedidoAction(b.taskId!, Number(min)))
                      }}
                      className="ml-auto text-faint hover:text-brand-deep"
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
                      className="ml-auto text-faint hover:text-brand-deep"
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
                      className="ml-auto w-24 rounded border border-edge bg-surface px-1 py-0.5 text-[0.6875rem] font-medium text-muted"
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

                {/* Delegar de verdad, distinto de marcar delegable: esta saca la
                    tarea de la carga de Mau. Se pide el nombre en el mismo gesto
                    porque sin a-quién no hay a quién darle seguimiento. */}
                {isTarea && !b.delegada && !b.done && (
                  <div className={FILA_MENU}>
                    <span>↦ Delegar a</span>
                    <CampoEnLinea
                      icono="✎"
                      titulo="¿Quién la va a hacer? Sale de tu carga y sigue visible como compromiso suyo"
                      placeholder="nombre"
                      ancho="w-20"
                      parse={(raw) => (raw.trim() === '' ? null : raw.trim())}
                      disabled={pending}
                      onSubmit={(quien) => {
                        cerrar()
                        startTransition(() => void delegarTareaAction(b.taskId!, String(quien)))
                      }}
                      className="ml-auto text-faint hover:text-brand-deep"
                    />
                  </div>
                )}

                {isTarea && b.delegada && (
                  <BotonMenu
                    disabled={pending}
                    titulo="Regresa la tarea a tu carga y a tu factor"
                    onClick={() => {
                      cerrar()
                      startTransition(() => void deshacerDelegacionAction(b.taskId!))
                    }}
                  >
                    ↤ La hago yo después de todo
                  </BotonMenu>
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
        </span>
      </div>

      {b.dodItems.length > 0 && (
        <ul className="mt-1.5 space-y-1 pl-[58px] sm:pl-[108px]">
          {b.dodItems.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-[0.8125rem]">
              <input
                type="checkbox"
                checked={d.done}
                disabled={pending}
                onChange={() => startTransition(() => void toggleDodItemAction(d.id))}
              />
              <span className={d.done ? 'text-faint line-through' : 'text-muted'}>{d.texto}</span>
              <button
                disabled={pending}
                onClick={() => startTransition(() => void discardDodItemAction(d.id))}
                className="text-faint hover:text-danger"
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
