'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import type { DayBlockView, PendienteView, ProyectoActivoView, StrandedBlockView } from './service'
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
import {
  scheduleTaskAction,
  moveBlockAction,
  carryToTodayAction,
  carryAllToTodayAction,
  closeDayAction,
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

// Confirmación en dos clics, sin `window.confirm`. El diálogo nativo es una
// trampa: si el navegador muestra "impedir que esta página cree diálogos
// adicionales" y el usuario lo marca, `confirm()` empieza a devolver `false` de
// inmediato y sin aviso — el botón queda muerto hasta recargar, sin señal de
// que algo se rompió. Aquí el primer clic arma el botón ("¿Quitar?") y el
// segundo ejecuta; se desarma solo a los 4 s o al salir el cursor.
function ConfirmarQuitar({
  onConfirm,
  disabled,
  titulo,
  className,
  armedClassName,
  icono = '✕',
  textoArmado = '¿Quitar?',
}: {
  onConfirm: () => void
  disabled: boolean
  titulo: string
  className: string
  armedClassName: string
  icono?: string
  textoArmado?: string
}) {
  const [armed, setArmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function disarm() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setArmed(false)
  }

  useEffect(() => disarm, [])

  return (
    <button
      disabled={disabled}
      onClick={() => {
        if (!armed) {
          setArmed(true)
          timer.current = setTimeout(() => setArmed(false), 4000)
          return
        }
        disarm()
        onConfirm()
      }}
      onMouseLeave={() => armed && disarm()}
      onBlur={() => armed && disarm()}
      className={armed ? armedClassName : className}
      title={armed ? 'Clic otra vez para confirmar' : titulo}
      aria-label={armed ? `Confirmar: ${textoArmado}` : titulo}
    >
      {armed ? textoArmado : icono}
    </button>
  )
}

// Input en línea para sustituir `window.prompt`, que carga la misma trampa que
// `confirm`: si el navegador silencia los diálogos de la página, `prompt()`
// devuelve `null` sin abrir nada y el botón queda muerto hasta recargar.
// Primer clic abre el input en el lugar del botón; Enter o ✓ guardan, Esc o ✕
// cancelan. Sin blur-cancela: pelearse con el clic en ✓ es una fuente clásica de
// "guardé y no pasó nada".
function CampoEnLinea({
  icono,
  titulo,
  valorInicial,
  placeholder,
  ancho,
  parse,
  onSubmit,
  disabled,
  className,
}: {
  icono: string
  titulo: string
  valorInicial?: string
  placeholder?: string
  ancho: string
  parse: (raw: string) => string | number | null
  onSubmit: (valor: string | number) => void
  disabled: boolean
  className: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [raw, setRaw] = useState('')
  const parsed = parse(raw)
  const valido = parsed !== null

  function abrir() {
    setRaw(valorInicial ?? '')
    setAbierto(true)
  }

  function guardar() {
    if (parsed === null) return
    setAbierto(false)
    onSubmit(parsed)
  }

  if (!abierto) {
    return (
      <button disabled={disabled} onClick={abrir} className={className} title={titulo} aria-label={titulo}>
        {icono}
      </button>
    )
  }

  return (
    <span
      draggable={false}
      onDragStart={(e) => e.stopPropagation()}
      className="ml-1 inline-flex items-center gap-1 align-middle"
    >
      <input
        autoFocus
        value={raw}
        placeholder={placeholder}
        aria-label={titulo}
        disabled={disabled}
        onChange={(e) => setRaw(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            guardar()
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            setAbierto(false)
          }
        }}
        className={`${ancho} rounded border px-1 py-0.5 text-xs text-neutral-900 ${
          valido ? 'border-neutral-300' : 'border-[#b43232]'
        }`}
      />
      <button
        disabled={disabled || !valido}
        onClick={guardar}
        className="text-xs font-bold text-[#0c4a45] disabled:text-neutral-300"
        title="Guardar"
        aria-label="Guardar"
      >
        ✓
      </button>
      <button
        disabled={disabled}
        onClick={() => setAbierto(false)}
        className="text-xs font-bold text-neutral-400 hover:text-[#b43232]"
        title="Cancelar"
        aria-label="Cancelar"
      >
        ✕
      </button>
    </span>
  )
}

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
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <RunningHero
        blocks={activos}
        tick={tick}
        esHoy={esHoy}
        selectedLabel={p.selectedLabel}
        pending={pending}
        startTransition={startTransition}
      />

      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#0d6d63]">
          Semana ISO {p.isoWeek.split('-W')[1]} · Jornada 09–18
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-[#0c4a45]">{p.rango}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#d3e4e0] px-3 py-1 text-xs font-semibold text-[#0c4a45]">
              Factor realismo {p.factorUsado.toFixed(1)}
            </span>
            {p.desbloqueador && (
              <span className="rounded-full bg-[#e8b94a] px-3 py-1 text-xs font-bold text-[#4a3a10]">
                ⚡ {p.desbloqueador}
              </span>
            )}
            {esHoy && (
              <>
                <button
                  disabled={pending}
                  onClick={() => startTransition(() => void startDayAction())}
                  className="rounded-full border border-[#0c4a45] px-3 py-1 text-xs font-bold text-[#0c4a45] hover:bg-[#0c4a45]/10"
                >
                  ▶ Arrancar día
                </button>
                <ConfirmarQuitar
                  disabled={pending}
                  onConfirm={() => startTransition(() => void closeDayAction(p.today))}
                  icono="🌙 Cerrar día"
                  textoArmado="¿Mover pendientes a mañana?"
                  titulo="Cerrar día — mueve las tareas sin terminar al siguiente día hábil"
                  className="rounded-full border border-[#0c4a45] px-3 py-1 text-xs font-bold text-[#0c4a45] hover:bg-[#0c4a45]/10"
                  armedClassName="rounded-full border border-[#b43232] bg-[#b43232] px-3 py-1 text-xs font-bold text-white"
                />
              </>
            )}
          </div>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-[#0c4a45]">🎯 Wins de la semana</h2>
          <ol className="space-y-2">
            {p.wins.map((w) => (
              <li key={w.posicion} className="flex gap-2 text-sm">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    w.estatus === 'logrado' ? 'bg-[#15803d] text-white' : 'bg-[#d3e4e0] text-[#0c4a45]'
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
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-[#0c4a45]">📐 Capacidad</h2>
          <div className="flex gap-6">
            <Stat n={p.trabajable.toFixed(0)} u="h" l="Trabajable" />
            <Stat n={p.carga.toFixed(0)} u="h" l="Carga" />
            <Stat n={`${p.colchon >= 0 ? '+' : ''}${p.colchon.toFixed(0)}`} u="h" l="Colchón" accent />
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className={`h-full ${p.pct > 100 ? 'bg-red-500' : 'bg-[#0d6d63]'}`}
              style={{ width: `${Math.min(100, p.pct)}%` }}
            />
          </div>
        </section>
      </div>

      <div className="flex gap-2 overflow-x-auto">
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
                active ? 'border-[#0c4a45] bg-[#0c4a45] text-white' : 'border-neutral-200 bg-white text-neutral-700'
              }`}
            >
              <span className="font-bold">{t.abr}</span>
              <span className="text-xs opacity-90">{t.num}</span>
            </Link>
          )
        })}
      </div>

      {esHoy && p.stranded.length > 0 && (
        <div className="rounded-lg border border-[#e8b94a] bg-[#fdf6e3] px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold text-[#7a5a00]">
              ⚠️ Tienes {p.stranded.length} tarea{p.stranded.length > 1 ? 's' : ''} de días anteriores sin terminar.
            </p>
            <button
              disabled={pending}
              onClick={() =>
                startTransition(() => void carryAllToTodayAction(p.stranded.map((s) => s.id), p.today))
              }
              className="rounded-md bg-[#e8b94a] px-3 py-1.5 text-xs font-bold text-[#4a3a10] hover:bg-[#dcae3e]"
            >
              Llevar todo a hoy
            </button>
          </div>
          <ul className="mt-2 space-y-1">
            {p.stranded.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-[#7a5a00]">
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

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div
          className="space-y-3"
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
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm">
            <div className="flex gap-5">
              <span className="text-[#0c4a45]">
                Planeado <strong className="text-[#0d6d63]">{horas(p.planeadoMin)}</strong>
              </span>
              <span className="text-[#0c4a45]">
                Real <strong className="text-[#15803d]">{p.realMin > 0 ? horas(p.realMin) : '0M'}</strong>
              </span>
              <span className="text-[#0c4a45]">
                Factor del día <strong className="text-[#0d6d63]">{p.factorDia ? p.factorDia.toFixed(2) : '—'}</strong>
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

          {p.blocks.length === 0 && (
            <p className="rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-400">
              Sin bloques este día. Usa <code>/wtw-dia</code> para armarlo.
            </p>
          )}
        </div>

        <div className="space-y-4">
          {esHoy && (
            <div className="rounded-xl bg-[#0c4a45] p-4 text-white shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-[#9fd0c8]">Capacidad de hoy</p>
              <p className={`mt-1 text-3xl font-bold ${p.capacidadHoy < 0 ? 'text-[#e8b94a]' : 'text-white'}`}>
                {p.capacidadHoy.toFixed(1)} h
              </p>
              <p className="text-xs font-medium text-[#c7e4de]">libres de ~{p.libresHoy.toFixed(0)} h</p>
              {p.capacidadHoy < 0 && (
                <p className="mt-2 text-xs font-semibold text-[#e8b94a]">
                  ⚠️ Sobrecargado {Math.abs(p.capacidadHoy).toFixed(1)} h — quita algo o muévelo a otro día.
                </p>
              )}
            </div>
          )}

          <div
            className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const data = e.dataTransfer.getData('text/plain')
              if (data.startsWith('block:')) {
                e.preventDefault()
                startTransition(() => void unscheduleBlockAction(data.slice(6)))
              }
            }}
          >
            <h3 className="mb-2 text-sm font-bold text-[#0c4a45]">
              📥 Pendientes urgentes <span className="text-neutral-400">({p.pendientes.length})</span>
            </h3>
            <p className="mb-2 text-[10px] text-neutral-400">Arrastra un bloque agendado aquí para regresarlo a pendientes.</p>
            <div className="max-h-[32rem] space-y-2 overflow-y-auto">
              {p.pendientes.map((pe) => (
                <div
                  key={pe.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', `pend:${pe.id}`)}
                  className={`cursor-grab rounded-lg border bg-white p-2.5 text-sm shadow-sm active:cursor-grabbing ${
                    pe.urgente ? 'border-neutral-200 border-l-4 border-l-red-500' : 'border-neutral-200'
                  }`}
                >
                  <p className="font-medium text-neutral-900">
                    {pe.urgente && <span className="text-red-600">★ </span>}
                    {pe.titulo}
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      {pe.estimadoMin != null && (
                        <span className="rounded bg-[#f5deae] px-1.5 py-0.5 font-semibold text-[#4a3a10]">
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
                        className="rounded bg-[#e8b94a] px-2 py-0.5 text-[10px] font-bold text-[#4a3a10] hover:bg-[#dcae3e]"
                      >
                        + Hoy
                      </button>
                      <ConfirmarQuitar
                        disabled={pending}
                        onConfirm={() => startTransition(() => void descartarPendienteAction(pe.id))}
                        titulo="Ya no aplica — quitar de pendientes (no cuenta como terminada)"
                        className="rounded px-1.5 py-0.5 text-[10px] font-bold text-neutral-400 hover:bg-red-50 hover:text-[#b43232]"
                        armedClassName="rounded bg-[#b43232] px-1.5 py-0.5 text-[10px] font-bold text-white"
                      />
                    </div>
                  </div>
                </div>
              ))}
              {p.pendientes.length === 0 && <p className="text-xs text-neutral-400">Sin pendientes sin agendar.</p>}
            </div>
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
      <p className={`text-2xl font-bold ${accent ? 'text-[#15803d]' : 'text-[#0c4a45]'}`}>
        {n}
        <span className="text-sm font-medium">{u}</span>
      </p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{l}</p>
    </div>
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
      <div className="sticky top-14 z-10 rounded-xl border-l-4 border-[#e8b94a] bg-[#0c4a45] px-5 py-4 text-white shadow-md md:top-0">
        <p className="text-xs font-bold uppercase tracking-wide text-[#e8b94a]">Vista de planeación</p>
        <p className="mt-1 text-sm">
          Estás viendo <strong>{selectedLabel}</strong>. El cronómetro en vivo funciona en el día de{' '}
          <strong className="text-[#e8b94a]">hoy</strong>.
        </p>
      </div>
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
      <div className="sticky top-14 z-10 rounded-xl bg-[#0c4a45] px-5 py-4 text-white shadow-md md:top-0">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[#9fd0c8]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#e8b94a]" /> Sin bloque ahora
        </p>
        <p className="mt-1 text-sm text-white/90">
          {next ? (
            <>
              Siguiente: <strong className="text-white">{next.titulo}</strong> a las {next.inicio}.
            </>
          ) : (
            'Sin más bloques agendados hoy.'
          )}
        </p>
      </div>
    )
  }

  const isTareaCronometrable = current.tipo === 'tarea' && !current.externa
  if (!isTareaCronometrable) {
    return (
      <div className="sticky top-14 z-10 rounded-xl bg-[#0c4a45] px-5 py-4 text-white shadow-md md:top-0">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[#9fd0c8]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#e8b94a]" /> Ahora · {current.inicio}–{current.fin}
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
    <div className="sticky top-14 z-10 rounded-xl bg-[#0c4a45] px-5 py-4 text-white shadow-md md:top-0">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[#9fd0c8]">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[#e8b94a]" />
        {isRunning ? 'En curso' : 'Ahora'} · {current.inicio}–{current.fin}
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold">{current.titulo}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {current.proyecto && <ProyectoBadge proyecto={current.proyecto} />}
            {current.winPosicion && (
              <span className="rounded-full bg-[#e8b94a] px-2 py-0.5 text-[10px] font-bold uppercase text-[#4a3a10]">
                Win {current.winPosicion}
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className={`font-mono text-3xl font-bold tabular-nums ${over ? 'text-[#e8b94a]' : 'text-white'}`}>
            {fmt(seconds)}
          </p>
          <p className="text-xs font-medium text-[#c7e4de]">de {horas(current.planMin)} planeado</p>
        </div>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
        <div
          className={`h-full ${over ? 'bg-[#e8b94a]' : 'bg-[#3fb6a8]'}`}
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
              className="rounded-md bg-[#e8b94a] px-3 py-1.5 text-sm font-bold text-[#4a3a10] hover:bg-[#dcae3e]"
            >
              ⏱️ Modo Focus
            </Link>
            <button
              disabled={pending}
              onClick={() => startTransition(() => void markTaskDoneAction(current.taskId!))}
              className="rounded-md bg-[#15803d] px-3 py-1.5 text-sm font-bold text-white hover:bg-[#12692f]"
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
            className="rounded-md bg-[#e8b94a] px-4 py-1.5 text-sm font-bold text-[#4a3a10] hover:bg-[#dcae3e]"
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
      className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] font-semibold text-neutral-500 hover:border-[#0d6d63] hover:text-[#0d6d63]"
      title="Capturar o revisar la minuta de esta junta"
    >
      {block.minutaId ? '📝 Ver minuta' : '📝 Minuta'}
    </button>
  )
}

function NudgeMinuta() {
  return (
    <span
      className="rounded-full bg-[#fdf6e3] px-2 py-0.5 text-[10px] font-bold uppercase text-[#7a5a00]"
      title="Esta junta terminó y no tiene minuta capturada"
    >
      ¿Minuta?
    </span>
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
          b.done ? 'border-neutral-200 border-l-neutral-300 bg-neutral-50' : 'border-neutral-200 border-l-[#0d6d63] bg-[#eef4f3]'
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-neutral-600">
              {b.inicio}–{b.fin}
              {!b.bloqueante && !b.done && (
                <span className="ml-2 rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-neutral-600">
                  Informativo
                </span>
              )}
            </p>
            <p className={`font-semibold ${b.done ? 'text-neutral-500 line-through' : 'text-neutral-900'}`}>
              📅 {b.titulo}
            </p>
            {nudgeMinuta && (
              <div className="mt-1">
                <NudgeMinuta />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {b.done ? (
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-700">
                Cancelada
              </span>
            ) : (
              <>
                {candidataMinuta && <MinutaBoton block={b} onAbrirMinuta={onAbrirMinuta} />}
                {enVivo && (
                  <>
                    <button
                      disabled={pending}
                      onClick={() => startTransition(() => void toggleBloqueanteAction(b.id))}
                      className="text-xs font-semibold text-neutral-400 hover:text-[#0c4a45]"
                      title="Marca si esta junta realmente ocupa tu tiempo (ej. compartida solo para visibilidad)"
                    >
                      {b.bloqueante ? '👁 No me bloquea' : '↺ Sí me bloquea'}
                    </button>
                    <button
                      disabled={pending}
                      onClick={() => startTransition(() => void cancelMeetingAction(b.id))}
                      className="text-xs font-semibold text-neutral-400 hover:text-red-600"
                      title="La junta se canceló"
                    >
                      ✕ Cancelar
                    </button>
                  </>
                )}
              </>
            )}
            <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">Outlook</span>
          </div>
        </div>
      </div>
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
          ? 'border-[#e8b94a] border-2 bg-[#fdf6e3]'
          : b.done
            ? 'border-neutral-200 bg-neutral-50'
            : 'border-neutral-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-neutral-500">
            {b.inicio === 'flex' ? '⋯ sin hora' : `${b.inicio}–${b.fin}`}
            {isTarea && !b.done && !b.runningSince && enVivo && (
              <CampoEnLinea
                icono="🕐"
                titulo="Cambiar hora de inicio (HH:MM)"
                valorInicial={b.inicio === 'flex' ? '09:00' : b.inicio}
                placeholder="HH:MM"
                ancho="w-16"
                parse={parseHora}
                disabled={pending}
                onSubmit={(hora) => startTransition(() => void setBlockTimeAction(b.id, String(hora)))}
                className="ml-2 text-neutral-400 hover:text-[#0c4a45]"
              />
            )}
            {b.fueraDeJornada && !b.done && (
              <span className="ml-2 rounded bg-[#e8b94a] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#4a3a10]">
                Fuera de jornada
              </span>
            )}
          </p>
          <p className={`font-semibold ${b.done ? 'text-neutral-500 line-through' : 'text-neutral-900'}`}>
            {b.titulo}
          </p>
          {nudgeMinuta && (
            <div className="mt-1">
              <NudgeMinuta />
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {candidataMinuta && <MinutaBoton block={b} onAbrirMinuta={onAbrirMinuta} />}
          {isTarea && !b.runningSince && (
            <span className={`font-mono text-sm font-semibold ${over ? 'text-red-600' : 'text-[#15803d]'}`}>
              {fmt(seconds)}
              <span className="text-xs font-medium text-neutral-400"> / {horas(b.planMin)}</span>
              {!b.done && enVivo && (
                <CampoEnLinea
                  icono="✎"
                  titulo="Ajustar duración planeada (minutos)"
                  valorInicial={String(b.planMin)}
                  placeholder="min"
                  ancho="w-14"
                  parse={parseMinutos}
                  disabled={pending}
                  onSubmit={(min) => startTransition(() => void setBlockDurationAction(b.id, Number(min)))}
                  className="ml-1 text-neutral-400 hover:text-[#0c4a45]"
                />
              )}
            </span>
          )}
          {isTarea && !b.done && !b.runningSince && enVivo && (
            <button
              disabled={pending}
              onClick={() => startTransition(() => void startTimerAction(b.taskId!))}
              className="rounded-md bg-[#e8b94a] px-3 py-1.5 text-sm font-bold text-[#4a3a10] hover:bg-[#dcae3e]"
            >
              ▶ Iniciar
            </button>
          )}
          {isTarea && b.runningSince && (
            <span className="rounded-full bg-[#d3e4e0] px-2 py-1 text-xs font-bold text-[#0c4a45]">
              ⏱ en el hero
            </span>
          )}
          {!b.runningSince && tabs.length > 0 && (
            <select
              disabled={pending}
              defaultValue=""
              onChange={(e) => {
                const fecha = e.target.value
                e.target.value = ''
                if (fecha) startTransition(() => void moveBlockAction(b.id, fecha))
              }}
              className="rounded-md border border-neutral-300 bg-white px-1.5 py-1.5 text-xs font-medium text-neutral-600"
            >
              <option value="" disabled>
                Mover a…
              </option>
              {tabs.filter((t) => t.fecha !== selectedDay).map((t) => (
                <option key={t.fecha} value={t.fecha}>
                  {t.abr} {t.num}
                </option>
              ))}
            </select>
          )}
          <button
            disabled={pending}
            onClick={() =>
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
            className="rounded-md bg-neutral-100 px-2.5 py-1.5 text-sm font-bold text-neutral-700 hover:bg-neutral-200"
          >
            {b.done ? '↺' : '✓'}
          </button>
          {isTarea && (
            <button
              disabled={pending}
              onClick={() => startTransition(() => void marcarDelegableAction(b.taskId!, !b.delegable))}
              className={`rounded-md px-2 py-1.5 text-sm font-bold ${
                b.delegable ? 'bg-[#5b4b8a] text-white' : 'text-neutral-300 hover:bg-neutral-100 hover:text-[#5b4b8a]'
              }`}
              title={
                b.delegable
                  ? 'Marcada como delegable — cuenta en la bitácora de Desarrollo'
                  : 'Esto lo debió hacer un perfil más junior — marcar como delegable'
              }
              aria-label={b.delegable ? 'Quitar marca de delegable' : 'Marcar como delegable'}
            >
              ↧
            </button>
          )}
          {isTarea && !b.done && (
            <ConfirmarQuitar
              disabled={pending}
              onConfirm={() => startTransition(() => void descartarTareaAction(b.id))}
              titulo="Ya no aplica — quitar del día y de pendientes (no cuenta como terminada)"
              className="rounded-md px-2 py-1.5 text-sm font-bold text-neutral-400 hover:bg-red-50 hover:text-[#b43232]"
              armedClassName="rounded-md bg-[#b43232] px-2 py-1.5 text-xs font-bold text-white"
            />
          )}
        </div>
      </div>

      {(b.proyecto || b.winPosicion || b.aliado || b.gerente) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {b.proyecto && <ProyectoBadge proyecto={b.proyecto} />}
          {b.winPosicion && (
            <span className="rounded-full bg-[#e8b94a] px-2 py-0.5 text-[10px] font-bold uppercase text-[#4a3a10]">
              Win {b.winPosicion}
            </span>
          )}
          {b.aliado && (
            <span className="rounded-full bg-[#15803d] px-2 py-0.5 text-[10px] font-bold uppercase text-white">
              Valor cliente
            </span>
          )}
          {b.gerente && (
            <span className="rounded-full bg-[#5b4b8a] px-2 py-0.5 text-[10px] font-bold uppercase text-white">
              → Gerente
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
            className={`h-full ${over ? 'bg-red-500' : 'bg-[#0d6d63]'}`}
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
                className="text-neutral-300 hover:text-red-500"
                title="Descartar — ya no aplica"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {isTarea && enVivo && !b.done && (
        <div className="mt-2">
          <CampoEnLinea
            icono="✎ agregar tiempo manual"
            titulo="Agregar minutos trabajados a mano"
            placeholder="min"
            ancho="w-14"
            parse={parseMinutos}
            disabled={pending}
            onSubmit={(min) => startTransition(() => void createManualEntryAction(b.taskId!, Number(min)))}
            className="text-[10px] font-semibold text-neutral-500 hover:text-neutral-700"
          />
        </div>
      )}
    </div>
  )
}
