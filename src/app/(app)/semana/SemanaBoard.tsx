'use client'

import { useEffect, useMemo, useState, useTransition, type CSSProperties, type DragEvent } from 'react'
import Link from 'next/link'
import { AyudaContextual } from '@/components/ayuda-contextual'
import { TrendCard } from '@/app/(app)/historico/TrendCard'
import {
  MIN_ALTO_BLOQUE_PX,
  PX_POR_HORA,
  PX_POR_MIN,
  durDesdeResize,
  fromMin,
  horaDesdeOffset,
  toMin,
} from './lienzo'
import type { LienzoBloque, LienzoSemana } from './service'
import {
  agendarTareaAction,
  alternarJuntaBloqueanteAction,
  cancelarJuntaAction,
  capturarEnBandejaAction,
  desagendarBloqueAction,
  moverBloqueAction,
  redimensionarBloqueAction,
  toggleWinAction,
} from './actions'

// Colores del lienzo que NO son tokens de Tailwind porque se componen en línea
// (el color del proyecto viene de la base, no de la hoja de estilos) — mismo
// patrón que `pillStyle` en DiaBoard: relleno del color al ~12% y el color
// saturado solo en el borde izquierdo de 3px.
const BRAND = '#0a7c82'
const GRIS_EXTERNA = '#9fb0ae'
const FONDO_EXTERNA = '#e3e9e8'
const LINEA_HORA = '#eef2f1'

function horas(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m === 0 ? `${h}h` : h === 0 ? `${m}m` : `${h}:${String(m).padStart(2, '0')}`
}

function colorDe(b: LienzoBloque): string {
  if (b.externa) return GRIS_EXTERNA
  return b.proyecto?.color ?? BRAND
}

function estiloBloque(b: LienzoBloque, destacado: boolean): CSSProperties {
  const color = colorDe(b)
  return {
    top: (b.topMin ?? 0) * PX_POR_MIN,
    height: Math.max(MIN_ALTO_BLOQUE_PX, b.durMin * PX_POR_MIN),
    backgroundColor: b.externa ? FONDO_EXTERNA : `${color}1f`,
    borderLeftColor: color,
    boxShadow: destacado ? `0 0 0 2px ${BRAND} inset` : undefined,
  }
}

const FONDO_COLUMNA = `repeating-linear-gradient(to bottom, transparent 0 ${PX_POR_HORA - 1}px, ${LINEA_HORA} ${
  PX_POR_HORA - 1
}px ${PX_POR_HORA}px)`

// ── El board ─────────────────────────────────────────────────────────────────

export function SemanaBoard({ v }: { v: LienzoSemana }) {
  const [pending, startTransition] = useTransition()
  // Regla 1: nada de `new Date()` como valor inicial. Arranca en null (el
  // servidor y el primer paint coinciden) y se llena al montar.
  const [ahoraMin, setAhoraMin] = useState<number | null>(null)
  const [zonaActiva, setZonaActiva] = useState<string | null>(null)
  const [captura, setCaptura] = useState('')
  const [tendenciasAbiertas, setTendenciasAbiertas] = useState(false)
  // Qué se está arrastrando (id + duración): el dataTransfer no se puede leer
  // durante dragover por diseño de HTML5, así que la duración del fantasma de
  // destino viaja por estado local, seteado en el dragstart de cada draggable.
  const [arrastre, setArrastre] = useState<{ durMin: number } | null>(null)
  // La sombra de destino: en qué columna y a qué hora caería el drop.
  const [previewDrop, setPreviewDrop] = useState<{ fecha: string; hhmm: string } | null>(null)
  // Resize en curso: el bloque crece/encoge en vivo y la action se dispara al soltar.
  const [resize, setResize] = useState<{ id: string; durMin: number } | null>(null)
  // Menú contextual de una junta de Outlook (posición fija: el grid tiene
  // overflow-hidden y un popover absolute se cortaría — decisión 14).
  const [menuJunta, setMenuJunta] = useState<{ id: string; bloqueante: boolean; x: number; y: number } | null>(null)

  useEffect(() => {
    function tick() {
      const d = new Date()
      setAhoraMin(d.getHours() * 60 + d.getMinutes())
    }
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])

  const altoGrid = v.horas.length * PX_POR_HORA
  const enGrid = useMemo(() => v.bloques.filter((b) => b.ubicacion === 'grid'), [v.bloques])
  const enFlex = useMemo(() => v.bloques.filter((b) => b.ubicacion === 'flex'), [v.bloques])

  // El bloque que importa AHORA: el que está corriendo, y si no hay ninguno, el
  // siguiente de hoy. Es la única marca de "atención" del lienzo — el resto de
  // la semana se lee, no se persigue.
  const destacadoId = useMemo(() => {
    if (ahoraMin === null) return null
    const hoy = v.dias.find((d) => d.esHoy)
    if (!hoy) return null
    const rel = ahoraMin - v.jornadaInicioMin
    const delDia = enGrid
      .filter((b) => b.fecha === hoy.fecha && !b.done)
      .sort((a, b) => (a.topMin ?? 0) - (b.topMin ?? 0))
    const enCurso = delDia.find((b) => rel >= (b.topMin ?? 0) && rel < (b.topMin ?? 0) + b.durMin)
    if (enCurso) return enCurso.id
    return delDia.find((b) => (b.topMin ?? 0) > rel)?.id ?? null
  }, [ahoraMin, enGrid, v.dias, v.jornadaInicioMin])

  const proyectos = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const b of v.bloques) if (b.proyecto) mapa.set(b.proyecto.nombre, b.proyecto.color)
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [v.bloques])

  const excedido = v.cargaHoras > v.trabajablePlaneable
  const pctCarga = v.trabajablePlaneable > 0 ? Math.min(100, (v.cargaHoras / v.trabajablePlaneable) * 100) : 0

  // ── Drop ───────────────────────────────────────────────────────────────────
  // Un solo despachador: el payload dice QUÉ se arrastra (`block:` / `pend:`,
  // el mismo vocabulario que Mi Día) y la zona dice A DÓNDE cae. `hhmm` es null
  // cuando se soltó en un lugar sin hora (cabecera del día o franja Flex).
  function limpiarArrastre() {
    setZonaActiva(null)
    setPreviewDrop(null)
    setArrastre(null)
  }

  function soltar(e: DragEvent<HTMLElement>, fecha: string, hhmm: string | null) {
    const data = e.dataTransfer.getData('text/plain')
    if (!data) return
    e.preventDefault()
    limpiarArrastre()
    if (data.startsWith('block:')) {
      startTransition(() => void moverBloqueAction(data.slice(6), fecha, hhmm))
    } else if (data.startsWith('pend:')) {
      startTransition(() => void agendarTareaAction(data.slice(5), fecha, hhmm))
    }
  }

  function soltarEnBandeja(e: DragEvent<HTMLElement>) {
    const data = e.dataTransfer.getData('text/plain')
    if (!data.startsWith('block:')) return
    e.preventDefault()
    limpiarArrastre()
    startTransition(() => void desagendarBloqueAction(data.slice(6)))
  }

  function permitir(e: DragEvent<HTMLElement>, zona: string) {
    e.preventDefault()
    if (zonaActiva !== zona) setZonaActiva(zona)
  }

  // Dragover de una columna del grid: además de marcar la zona, calcula a qué
  // hora caería el drop y pinta ahí la sombra de destino.
  function sobreColumna(e: DragEvent<HTMLElement>, fecha: string) {
    permitir(e, `col:${fecha}`)
    const rect = e.currentTarget.getBoundingClientRect()
    const hhmm = horaDesdeOffset(e.clientY - rect.top, v.jornadaInicioMin, v.jornadaFinMin)
    if (previewDrop?.fecha !== fecha || previewDrop?.hhmm !== hhmm) setPreviewDrop({ fecha, hhmm })
  }

  // El resize vive en el board (no en el bloque) porque el pointer sale del
  // bloque en cuanto se arrastra: los listeners van a window y se quitan al soltar.
  function iniciarResize(b: LienzoBloque, e: React.PointerEvent<HTMLElement>) {
    e.preventDefault()
    e.stopPropagation()
    const startY = e.clientY
    const durInicial = b.durMin
    setResize({ id: b.id, durMin: durInicial })
    function move(ev: PointerEvent) {
      setResize({ id: b.id, durMin: durDesdeResize(durInicial, ev.clientY - startY) })
    }
    function up(ev: PointerEvent) {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const durFinal = durDesdeResize(durInicial, ev.clientY - startY)
      setResize(null)
      if (durFinal !== durInicial) startTransition(() => void redimensionarBloqueAction(b.id, durFinal))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function abrirMenuJunta(b: LienzoBloque, e: React.MouseEvent<HTMLElement>) {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setMenuJunta({
      id: b.id,
      bloqueante: b.bloqueante,
      x: Math.min(rect.left, window.innerWidth - 250),
      y: rect.bottom + 4,
    })
  }

  function capturar() {
    const titulo = captura.trim()
    if (!titulo) return
    setCaptura('')
    startTransition(() => void capturarEnBandejaAction(titulo))
  }

  const columnas = 'grid-cols-[48px_repeat(5,minmax(0,1fr))]'

  return (
    <div className={`flex min-h-dvh flex-col bg-paper xl:flex-row ${pending ? 'opacity-90' : ''}`}>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── Barra superior ─────────────────────────────────────────────── */}
        <div className="flex h-12 shrink-0 flex-wrap items-center gap-3 border-b border-hair bg-surface px-4 sm:px-6">
          <div className="flex overflow-hidden rounded-md border border-hair text-xs font-semibold">
            <Link href={`/dia?dia=${v.diaSeleccionado}`} className="px-3 py-1.5 text-muted hover:text-brand">
              Día
            </Link>
            <span className="bg-brand-deep px-3 py-1.5 text-white">Semana</span>
          </div>
          <span className="font-semibold text-ink">Semana {v.numeroSemana}</span>
          <span className="num text-xs text-muted">{v.rango}</span>
          <span className="flex-1" />
          <span className="text-xs text-muted">
            Carga{' '}
            <b className={`num ${excedido ? 'text-danger' : 'text-ink'}`}>{v.cargaHoras.toFixed(1)}h</b> de{' '}
            <b className="num text-ink">{v.trabajablePlaneable.toFixed(1)}h</b> planeables{' '}
            <span className="text-faint">
              ({v.trabajableTotal.toFixed(0)}h trabajables − {v.bufferPct}% colchón)
            </span>
          </span>
          <AyudaContextual titulo="Carga contra lo planeable" alineacion="derecha">
            <strong>Carga</strong> es la suma de lo que ya está comprometido esta semana.{' '}
            <strong>Planeable</strong> son las horas que quedan libres después de las juntas, menos el colchón que
            reservas a propósito para lo que no se puede prever. Si la barra se pone roja, comprometiste más de lo que
            cabe: la respuesta es mover o soltar trabajo, no exprimir el colchón.
          </AyudaContextual>
          <div className="h-1 w-[140px] overflow-hidden rounded-full bg-hair">
            <div
              className={`h-full ${excedido ? 'bg-danger' : 'bg-brand'}`}
              style={{ width: `${excedido ? 100 : pctCarga}%` }}
            />
          </div>
          <ChipSobrecarga sobrecarga={v.sobrecarga} />
          <Link
            href="/semana/nueva"
            className="rounded-md border border-hair px-3 py-1.5 text-xs font-semibold text-brand hover:border-brand"
          >
            Abrir el planeador
          </Link>
        </div>

        {/* ── Lienzo ──────────────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1 overflow-x-auto p-4 pr-0">
          <div className="min-w-[720px]">
            {/* Cabecera de días: nombre, número y el meter de carga del día.
                También es zona de drop "a este día, sin hora". */}
            <div className={`mb-1.5 grid ${columnas}`}>
              <div />
              {v.dias.map((d) => (
                <div
                  key={d.fecha}
                  onDragOver={(e) => permitir(e, `head:${d.fecha}`)}
                  onDragLeave={() => setZonaActiva(null)}
                  onDrop={(e) => soltar(e, d.fecha, null)}
                  className={`rounded-md px-2 py-0.5 ${zonaActiva === `head:${d.fecha}` ? 'bg-brand-soft' : ''}`}
                >
                  <div className="flex items-baseline gap-1.5">
                    <span className={`font-semibold ${d.esHoy ? 'text-brand-deep' : 'text-ink'}`}>{d.abr}</span>
                    <span className={`num text-[11px] ${d.esHoy ? 'text-brand-deep' : 'text-faint'}`}>
                      {d.num}
                      {d.esHoy ? ' · hoy' : ''}
                    </span>
                    <span className="num ml-auto text-[10px] text-faint">{horas(d.planeadoMin)}</span>
                  </div>
                  <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-hair">
                    <div
                      className={`h-full ${d.pct > 100 ? 'bg-danger' : 'bg-brand'}`}
                      style={{ width: `${Math.min(100, d.pct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Grid de horas */}
            <div
              className={`grid ${columnas} overflow-hidden rounded-tl-[10px] border border-hair bg-surface`}
              style={{ height: altoGrid }}
            >
              <div className="flex flex-col border-r border-hair">
                {v.horas.map((h) => (
                  <div
                    key={h}
                    className="num border-b px-1.5 py-1 text-[10px] text-faint"
                    style={{ height: PX_POR_HORA, borderColor: LINEA_HORA }}
                  >
                    {h}
                  </div>
                ))}
              </div>

              {v.dias.map((d) => (
                <div
                  key={d.fecha}
                  onDragOver={(e) => sobreColumna(e, d.fecha)}
                  onDragLeave={() => {
                    setZonaActiva(null)
                    setPreviewDrop(null)
                  }}
                  onDrop={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    soltar(e, d.fecha, horaDesdeOffset(e.clientY - rect.top, v.jornadaInicioMin, v.jornadaFinMin))
                  }}
                  className={`relative border-r last:border-r-0 ${
                    zonaActiva === `col:${d.fecha}` ? 'ring-1 ring-inset ring-brand' : ''
                  }`}
                  style={{
                    borderColor: LINEA_HORA,
                    background: d.esHoy ? `#f8fbfa ${FONDO_COLUMNA}` : FONDO_COLUMNA,
                  }}
                >
                  {enGrid
                    .filter((b) => b.fecha === d.fecha)
                    .map((b) => (
                      <BloqueEnGrid
                        key={b.id}
                        b={b}
                        destacado={b.id === destacadoId}
                        durMinVisual={resize?.id === b.id ? resize.durMin : null}
                        onDragStartBlock={() => setArrastre({ durMin: b.durMin })}
                        onDragEndBlock={limpiarArrastre}
                        onResizeStart={iniciarResize}
                        onMenuJunta={abrirMenuJunta}
                      />
                    ))}

                  {/* Sombra de destino: dónde caería el bloque si se suelta aquí. */}
                  {arrastre && previewDrop?.fecha === d.fecha && (
                    <div
                      className="pointer-events-none absolute inset-x-1 z-20 rounded-md border-2 border-dashed border-brand bg-brand-soft/50"
                      style={{
                        top: (toMin(previewDrop.hhmm) - v.jornadaInicioMin) * PX_POR_MIN,
                        height: Math.max(MIN_ALTO_BLOQUE_PX, arrastre.durMin * PX_POR_MIN),
                      }}
                    >
                      <span className="num absolute -top-0.5 right-1 text-[10px] font-semibold text-brand-deep">
                        → {previewDrop.hhmm}
                      </span>
                    </div>
                  )}

                  {/* Línea de la hora actual — solo en la columna de hoy y solo
                      después de montar (regla 1). */}
                  {d.esHoy &&
                    ahoraMin !== null &&
                    ahoraMin >= v.jornadaInicioMin &&
                    ahoraMin <= v.jornadaFinMin && (
                      <div
                        className="pointer-events-none absolute inset-x-0 border-t-2 border-danger"
                        style={{ top: (ahoraMin - v.jornadaInicioMin) * PX_POR_MIN }}
                      >
                        <span className="num absolute right-1 -top-2 bg-surface px-0.5 text-[9px] text-danger">
                          {String(Math.floor(ahoraMin / 60)).padStart(2, '0')}:
                          {String(ahoraMin % 60).padStart(2, '0')}
                        </span>
                      </div>
                    )}
                </div>
              ))}
            </div>

            {/* Franja Flex: lo que tiene día pero no hora. Soltar aquí agenda al
                día sin comprometer una hora — que es exactamente lo que un
                bloque flex significa. */}
            <div className={`grid ${columnas} border-x border-b border-hair bg-surface`}>
              <div className="lbl flex items-start justify-end border-r border-hair px-1.5 py-2 text-[9px]">Flex</div>
              {v.dias.map((d) => {
                const chips = enFlex.filter((b) => b.fecha === d.fecha)
                return (
                  <div
                    key={d.fecha}
                    onDragOver={(e) => permitir(e, `flex:${d.fecha}`)}
                    onDragLeave={() => setZonaActiva(null)}
                    onDrop={(e) => soltar(e, d.fecha, null)}
                    className={`min-h-[38px] space-y-1 border-r p-1 last:border-r-0 ${
                      zonaActiva === `flex:${d.fecha}` ? 'bg-brand-soft' : ''
                    }`}
                    style={{ borderColor: LINEA_HORA }}
                  >
                    {chips.map((b) => (
                      <div
                        key={b.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', `block:${b.id}`)
                          setArrastre({ durMin: b.planMin })
                        }}
                        onDragEnd={limpiarArrastre}
                        className="cursor-grab truncate rounded border-l-[3px] px-1.5 py-1 text-[11px] text-ink active:cursor-grabbing"
                        style={{
                          backgroundColor: `${colorDe(b)}1f`,
                          borderLeftColor: colorDe(b),
                        }}
                        title={`${b.titulo} · ${horas(b.planMin)}`}
                      >
                        {b.titulo}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>

            {/* Fuera de jornada */}
            {v.fueraDeJornada.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 pl-12 text-xs text-warn">
                <span className="lbl text-warn">Fuera de jornada</span>
                {v.fueraDeJornada.map((f) => (
                  <span key={f.blockId}>
                    {f.abr} <span className="num">{f.rango}</span> · {f.titulo}
                  </span>
                ))}
                {v.fueraPct !== null && (
                  <span className="text-faint">
                    · <span className="num">{v.fueraPct}%</span> de tus minutos de 14 días cayeron aquí
                  </span>
                )}
              </div>
            )}

            <Tendencias
              tendencias={v.tendencias}
              abiertas={tendenciasAbiertas}
              onToggle={() => setTendenciasAbiertas((x) => !x)}
            />
          </div>
        </div>
      </div>

      {/* ── Bandeja ───────────────────────────────────────────────────────── */}
      <aside
        onDragOver={(e) => permitir(e, 'bandeja')}
        onDragLeave={() => setZonaActiva(null)}
        onDrop={soltarEnBandeja}
        className={`flex w-full shrink-0 flex-col gap-5 border-hair bg-surface p-5 xl:w-[300px] xl:border-l ${
          zonaActiva === 'bandeja' ? 'ring-1 ring-inset ring-brand' : ''
        }`}
      >
        <section className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <span className="lbl">
              Bandeja <span className="num">({v.bandeja.length})</span>
            </span>
            <span className="text-[11px] text-faint">arrastra al lienzo</span>
          </div>
          <div className="flex flex-col gap-2">
            {v.bandeja.length === 0 && <p className="text-xs text-faint">Nada suelto. La semana está capturada.</p>}
            {v.bandeja.map((t) => (
              <div
                key={t.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', `pend:${t.id}`)
                  setArrastre({ durMin: t.estimadoMin ?? 30 })
                }}
                onDragEnd={limpiarArrastre}
                className="flex cursor-grab items-start gap-2.5 rounded-lg border border-dashed border-hair px-3 py-2.5 text-[13px] active:cursor-grabbing"
              >
                <span className="text-sm leading-none text-faint">⋮⋮</span>
                <span className="min-w-0 flex-1">
                  {t.urgente && <span className="text-danger">★ </span>}
                  {t.titulo}
                  <br />
                  <span className="num text-[11px] text-muted">
                    {t.estimadoMin != null ? horas(t.estimadoMin) : '—'}
                    {t.proyecto ? ` · ${t.proyecto}` : ''}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <input
            value={captura}
            onChange={(e) => setCaptura(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') capturar()
            }}
            onBlur={capturar}
            placeholder="+ Capturar algo suelto…"
            aria-label="Capturar algo suelto"
            className="rounded-lg border border-hair px-3 py-2 text-xs text-ink outline-none focus:border-brand"
          />
        </section>

        <section className="flex flex-col gap-2.5">
          <span className="lbl">Wins</span>
          {v.wins.length === 0 ? (
            <p className="text-xs text-warn">
              Sin Wins esta semana. El{' '}
              <Link href="/semana/nueva" className="underline">
                planeador
              </Link>{' '}
              los define en el paso 2.
            </p>
          ) : (
            <div className="flex flex-col gap-2 text-[12.5px]">
              {v.wins.map((w) => (
                <div key={w.id} className="grid grid-cols-[16px_1fr_auto] gap-1.5">
                  <span className="num text-faint">{w.posicion}</span>
                  <span className={w.estatus === 'logrado' ? 'text-faint line-through' : 'text-ink'}>
                    {w.titulo}
                    {w.sinBloques && w.estatus !== 'logrado' && (
                      <span className="text-[11px] text-warn"> · sin bloques</span>
                    )}
                    {/* El si-entonces se REPASA aquí: sirve por estar ensayado
                        antes de que llegue el obstáculo, no por haberse escrito
                        una vez en el planeador. */}
                    {w.siEntonces && w.estatus !== 'logrado' && (
                      <span className="mt-1 block text-[11px] text-brand-deep">{w.siEntonces}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => startTransition(() => void toggleWinAction(w.id))}
                    aria-label={w.estatus === 'logrado' ? 'Desmarcar win' : 'Marcar win como logrado'}
                    className="h-5 w-5 shrink-0 rounded text-xs text-muted hover:bg-brand-soft"
                  >
                    {w.estatus === 'logrado' ? '↺' : '✓'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-auto flex flex-col gap-1.5 border-t border-hair pt-4 text-xs text-muted">
          <span className="lbl">Leyenda</span>
          {proyectos.map(([nombre, color]) => (
            <span key={nombre} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-[3px] border-l-[3px]"
                style={{ backgroundColor: `${color}1f`, borderLeftColor: color }}
              />
              {nombre}
            </span>
          ))}
          {v.bloques.some((b) => b.externa) && (
            <span className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-[3px] border-l-[3px]"
                style={{ backgroundColor: FONDO_EXTERNA, borderLeftColor: GRIS_EXTERNA }}
              />
              Junta de Outlook
            </span>
          )}
        </section>
      </aside>

      {/* Menú de junta de Outlook — fixed para que ningún overflow lo corte. */}
      {menuJunta && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuJunta(null)} aria-hidden />
          <div
            role="menu"
            className="fixed z-50 w-60 rounded-lg border border-hair bg-surface p-1 shadow-lg"
            style={{ top: menuJunta.y, left: menuJunta.x }}
          >
            <button
              type="button"
              role="menuitem"
              disabled={pending}
              onClick={() => {
                const id = menuJunta.id
                setMenuJunta(null)
                startTransition(() => void alternarJuntaBloqueanteAction(id))
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-semibold text-ink hover:bg-paper disabled:opacity-40"
            >
              {menuJunta.bloqueante ? 'No me quita tiempo' : 'Sí me quita tiempo'}
            </button>
            <p className="px-2 pb-1 text-[10.5px] leading-snug text-faint">
              {menuJunta.bloqueante
                ? 'Sigue visible pero deja de restar capacidad — y puedes poner bloques encima.'
                : 'Vuelve a restar capacidad y a estorbar el acomodo del día.'}
            </p>
            <button
              type="button"
              role="menuitem"
              disabled={pending}
              onClick={() => {
                const id = menuJunta.id
                setMenuJunta(null)
                startTransition(() => void cancelarJuntaAction(id))
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-semibold text-danger hover:bg-danger-soft disabled:opacity-40"
            >
              Cancelada — quitar de la semana
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// Calm tech: en verde no se muestra nada. En ámbar/rojo, un chip junto a la
// barra de carga con las señales activas y su explicación — el semáforo no se
// anuncia solo, se explica solo.
function ChipSobrecarga({ sobrecarga }: { sobrecarga: LienzoSemana['sobrecarga'] }) {
  if (sobrecarga.nivel === 'verde') return null
  const esRojo = sobrecarga.nivel === 'rojo'
  return (
    <span
      className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold ${
        esRojo ? 'bg-danger-soft text-danger' : 'bg-warn-soft text-warn'
      }`}
    >
      {esRojo ? 'Carga: en espiral' : 'Carga: al límite'}
      <AyudaContextual
        titulo="Semáforo de sobrecarga"
        alineacion="derecha"
        ejemplo="Antes de aceptar algo nuevo, corre /wtw-comprometer — o recorta en el planeador."
      >
        {sobrecarga.senales.join(' ')}
      </AyudaContextual>
    </span>
  )
}

// ── Piezas ───────────────────────────────────────────────────────────────────

function BloqueEnGrid({
  b,
  destacado,
  durMinVisual,
  onDragStartBlock,
  onDragEndBlock,
  onResizeStart,
  onMenuJunta,
}: {
  b: LienzoBloque
  destacado: boolean
  /** Duración en vivo durante un resize; null cuando no se está redimensionando. */
  durMinVisual: number | null
  onDragStartBlock: () => void
  onDragEndBlock: () => void
  onResizeStart: (b: LienzoBloque, e: React.PointerEvent<HTMLElement>) => void
  onMenuJunta: (b: LienzoBloque, e: React.MouseEvent<HTMLElement>) => void
}) {
  const durMin = durMinVisual ?? b.durMin
  const enResize = durMinVisual !== null
  // Solo caben dos renglones a partir de ~45 min; abajo de eso el rango horario
  // desplazaría al título, que es lo único que de verdad hay que leer.
  const cabeRango = durMin >= 45
  const finVisual = enResize && b.inicio !== 'flex' ? fromMin(toMin(b.inicio) + durMin) : b.fin
  // Junta informativa: sigue a la vista pero no manda — atenuada, punteada, y
  // debajo de los bloques de tarea (que sí pueden sobreponérsele).
  const informativa = b.externa && !b.bloqueante
  return (
    <div
      draggable={!b.externa && !enResize}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', `block:${b.id}`)
        onDragStartBlock()
      }}
      onDragEnd={onDragEndBlock}
      style={{
        ...estiloBloque(b, destacado),
        height: Math.max(MIN_ALTO_BLOQUE_PX, durMin * PX_POR_MIN),
      }}
      title={`${b.inicio}–${b.fin} · ${b.titulo}`}
      className={`group absolute inset-x-1 overflow-hidden rounded-md border-l-[3px] px-2 py-1.5 text-[11.5px] leading-[1.3] ${
        b.externa ? 'z-0 cursor-default text-muted' : 'z-10 cursor-grab text-ink active:cursor-grabbing'
      } ${b.done ? 'opacity-50 line-through' : ''} ${
        informativa ? 'border border-l-[3px] border-dashed border-faint opacity-60' : ''
      } ${enResize ? 'ring-1 ring-brand' : ''}`}
    >
      {b.externa && (
        <span className="flex items-start justify-between gap-1 text-[10px] font-bold tracking-[0.06em]">
          <span>
            OUTLOOK
            {informativa && <span className="font-normal text-faint"> · no bloquea</span>}
          </span>
          <button
            type="button"
            onClick={(e) => onMenuJunta(b, e)}
            aria-label={`Opciones de la junta ${b.titulo}`}
            className="-mr-1 -mt-0.5 rounded px-1 text-[12px] font-bold text-muted opacity-0 hover:bg-hair focus-visible:opacity-100 group-hover:opacity-100"
          >
            ⋯
          </button>
        </span>
      )}
      <span className={destacado ? 'font-semibold' : ''}>{b.titulo}</span>
      {cabeRango && (
        <span className="num mt-0.5 block text-[10px] text-muted">
          {b.inicio} – {enResize ? <b className="text-brand-deep">{finVisual}</b> : b.fin}
        </span>
      )}
      {/* Esquina de resize: solo bloques de tarea con hora. El handle mata el
          drag nativo para que estirar nunca se confunda con mover. */}
      {!b.externa && !b.done && b.inicio !== 'flex' && (
        <span
          draggable={false}
          onDragStart={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onPointerDown={(e) => onResizeStart(b, e)}
          aria-hidden
          className="absolute inset-x-0 bottom-0 flex h-2.5 cursor-ns-resize items-end justify-center opacity-0 group-hover:opacity-100"
        >
          <span className="mb-[3px] h-[3px] w-8 rounded-full bg-brand/50" />
        </span>
      )}
      {enResize && (
        <span className="num absolute bottom-1 right-1.5 rounded bg-surface px-1 text-[10px] font-semibold text-brand-deep">
          {horas(durMin)}
        </span>
      )}
    </div>
  )
}

function formatDelta(delta: number, decimals: number, suffix = ''): string {
  const signo = delta > 0 ? '+' : delta < 0 ? '' : '±'
  return `${signo}${delta.toFixed(decimals)}${suffix}`
}

// R4: el histórico deja de ser una ruta a la que hay que acordarse de ir y pasa
// a ser el pie del lienzo — colapsado, porque la tendencia se consulta cuando
// se cierra la semana, no cada vez que se abre. /historico sigue existiendo.
function Tendencias({
  tendencias,
  abiertas,
  onToggle,
}: {
  tendencias: LienzoSemana['tendencias']
  abiertas: boolean
  onToggle: () => void
}) {
  const cronologico = [...tendencias].reverse()
  const ultima = cronologico[cronologico.length - 1]
  const isoWeeks = cronologico.map((h) => h.isoWeek)

  return (
    <section className="hair mt-3 py-2 pr-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abiertas}
        className="flex w-full items-center gap-3 text-left"
      >
        <span className="lbl">Tendencias</span>
        {ultima ? (
          <span className="num text-xs text-muted">
            factor {ultima.factorUsado.toFixed(2)} · wins {ultima.winsLogrados}/{ultima.winsTotal} · horas{' '}
            {ultima.minutosMedidos !== null ? `${(ultima.minutosMedidos / 60).toFixed(1)}h` : '—'}
          </span>
        ) : (
          <span className="text-xs text-faint">sin semanas cerradas todavía</span>
        )}
        <span className="ml-auto text-xs text-faint">{abiertas ? '▾' : '▸'}</span>
      </button>

      {abiertas &&
        (cronologico.length < 2 ? (
          <p className="mt-2 text-xs text-faint">Con 2+ semanas cerradas aparecen las tendencias.</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <TrendCard
              title="Factor de realismo por semana"
              values={cronologico.map((h) => h.factorUsado)}
              isoWeeks={isoWeeks}
              formatValue={(x) => x.toFixed(2)}
              formatDelta={(d) => formatDelta(d, 2)}
              emptyMessage="Sin factor registrado."
            />
            <TrendCard
              title="Wins logrados por semana"
              values={cronologico.map((h) => h.winsLogrados)}
              isoWeeks={isoWeeks}
              formatValue={(x) => `${x}`}
              formatDelta={(d) => formatDelta(d, 0)}
              lastValueLabel={`${ultima.winsLogrados}/${ultima.winsTotal}`}
              emptyMessage="Sin wins registrados."
            />
            <TrendCard
              title="Horas medidas por semana"
              values={cronologico.map((h) => h.minutosMedidos)}
              isoWeeks={isoWeeks}
              formatValue={(x) => `${(x / 60).toFixed(1)}h`}
              formatDelta={(d) => formatDelta(d / 60, 1, 'h')}
              emptyMessage="Sin registros de tiempo todavía."
            />
          </div>
        ))}
    </section>
  )
}
