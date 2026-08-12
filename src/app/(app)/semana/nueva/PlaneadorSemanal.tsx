'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import type { ContextoPlaneacion } from './service'
import type { CompetenciaPlaneacion } from '@/app/(app)/desarrollo/service'
import { balance } from './service'
import { crearSemanaAction, type NuevaSemanaTask } from './actions'
import { recapAction, sugerirWinsAction, estimarAction, triageAction, premortemAction } from './ai-actions'

const PASOS = ['Reflejar', 'Wins', 'Vaciar', 'Bloquear', 'Pre-emptar'] as const
const DRAFT_KEY = 'wtw_planeador_draft_v2'

type Item = {
  ref: string
  id?: string
  titulo: string
  proyecto?: string
  herramienta?: string | null
  deadline?: string | null
  estimadoMin: number
  winPosicion?: number
  fecha?: string
  incluida: boolean
  arrastrada: boolean
  competenciaId?: string
}

type WinDraft = { titulo: string; dod: string }
type Riesgo = { riesgo: string; defensa: string }

type Draft = {
  paso: number
  reflexion: string
  wins: WinDraft[]
  items: Item[]
  riesgos: Riesgo[]
  desbloqueador: string
}

function horas(min: number): string {
  if (min <= 0) return '0h'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

// Se lee en el inicializador de useState, no en un efecto: setState dentro de un
// efecto provoca renders en cascada (regla react-hooks/set-state-in-effect) y un
// parpadeo del paso 1. Es seguro tocar localStorage aquí porque el componente se
// monta solo en cliente — ver PlaneadorClient.tsx.
function leerDraft(ctx: ContextoPlaneacion): Draft {
  try {
    const guardado = localStorage.getItem(DRAFT_KEY)
    if (guardado) {
      const parsed = JSON.parse(guardado) as Draft
      if (Array.isArray(parsed?.items) && Array.isArray(parsed?.wins)) return parsed
    }
  } catch {
    // draft corrupto: se arranca limpio en vez de tirar el ritual completo
  }
  return draftInicial(ctx)
}

function draftInicial(ctx: ContextoPlaneacion): Draft {
  return {
    paso: 0,
    reflexion: '',
    wins: [
      { titulo: '', dod: '' },
      { titulo: '', dod: '' },
      { titulo: '', dod: '' },
    ],
    items: ctx.backlog.map((t) => ({
      ref: t.id,
      id: t.id,
      titulo: t.titulo,
      proyecto: t.proyecto ?? undefined,
      herramienta: t.herramienta,
      deadline: t.deadline,
      estimadoMin: t.estimadoMin ?? 0,
      // Las arrastradas entran preseleccionadas: es trabajo que ya empezaste y
      // sigue vivo. Los urgentes del backlog también.
      incluida: t.urgente || t.origen === 'arrastrada',
      arrastrada: t.origen === 'arrastrada',
      fecha: undefined,
    })),
    riesgos: [],
    desbloqueador: '',
  }
}

export function PlaneadorSemanal({ ctx }: { ctx: ContextoPlaneacion }): React.ReactElement {
  const [draft, setDraft] = useState<Draft>(() => leerDraft(ctx))
  const [error, setError] = useState<string | null>(null)
  const [cargandoIA, setCargandoIA] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Escribir a localStorage sí es trabajo de efecto: sincroniza estado de React
  // con un sistema externo. El ritual son ~10 min; si se cae la conexión o se
  // cierra la pestaña, no se pierde.
  useEffect(
    function guardarDraft(): void {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    },
    [draft]
  )

  function set(cambio: Partial<Draft>): void {
    setDraft((d) => ({ ...d, ...cambio }))
  }

  function setItem(ref: string, cambio: Partial<Item>): void {
    setDraft((d) => ({ ...d, items: d.items.map((it) => (it.ref === ref ? { ...it, ...cambio } : it)) }))
  }

  async function conIA(nombre: string, fn: () => Promise<void>): Promise<void> {
    setError(null)
    setCargandoIA(nombre)
    try {
      await fn()
    } finally {
      setCargandoIA(null)
    }
  }

  const incluidas = draft.items.filter((it) => it.incluida)
  const winsLlenos = draft.wins.filter((w) => w.titulo.trim() !== '')
  const cargaAjustada = Math.round(incluidas.reduce((s, it) => s + it.estimadoMin, 0) * ctx.factor)
  const bal = balance(cargaAjustada, ctx.capacidad)
  const sinEstimar = incluidas.filter((it) => it.estimadoMin <= 0)

  if (ctx.yaPlaneada) {
    return (
      <div className="rounded-xl border border-[#e8b94a] bg-[#fdf6e3] p-6">
        <h1 className="text-lg font-bold text-[#4a3a10]">La semana {ctx.isoWeek} ya está planeada</h1>
        <p className="mt-2 text-sm text-[#4a3a10]">
          Para replanear, primero cierra o borra la semana actual. Así no se duplican tareas ni bloques.
        </p>
        <Link href="/semana" className="mt-4 inline-block rounded-full bg-[#0c4a45] px-4 py-2 text-sm font-bold text-white">
          Ver mi semana
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-bold text-[#0c4a45]">Planear la semana {ctx.isoWeek}</h1>
        <p className="text-xs text-neutral-500">
          Factor de realismo {ctx.factor} · {horas(Math.round(ctx.capacidad.trabajablePlaneable * 60))} planeables
        </p>
      </header>

      <ol className="flex flex-wrap gap-1">
        {PASOS.map((nombre, i) => (
          <li key={nombre}>
            <button
              onClick={() => set({ paso: i })}
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                i === draft.paso
                  ? 'bg-[#0c4a45] text-white'
                  : i < draft.paso
                    ? 'bg-[#d3e4e0] text-[#0c4a45]'
                    : 'bg-neutral-100 text-neutral-500'
              }`}
            >
              {i + 1}. {nombre}
            </button>
          </li>
        ))}
      </ol>

      {error && (
        <p className="rounded-lg border border-[#b43232] bg-red-50 px-3 py-2 text-sm text-[#b43232]" role="alert">
          {error}
        </p>
      )}

      <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        {draft.paso === 0 && (
          <PasoReflejar
            ctx={ctx}
            reflexion={draft.reflexion}
            onChange={(reflexion) => set({ reflexion })}
            cargando={cargandoIA === 'recap'}
            onIA={() =>
              conIA('recap', async () => {
                const r = await recapAction()
                if (r.ok) set({ reflexion: r.datos })
                else setError(r.error)
              })
            }
          />
        )}

        {draft.paso === 1 && (
          <PasoWins
            wins={draft.wins}
            onChange={(wins) => set({ wins })}
            cargando={cargandoIA === 'wins'}
            onIA={() =>
              conIA('wins', async () => {
                const r = await sugerirWinsAction()
                if (!r.ok) return setError(r.error)
                const sugeridos = r.datos.map((w) => ({ titulo: w.titulo, dod: w.dod ?? '' }))
                while (sugeridos.length < 3) sugeridos.push({ titulo: '', dod: '' })
                set({ wins: sugeridos })
              })
            }
          />
        )}

        {draft.paso === 2 && (
          <PasoVaciar
            items={draft.items}
            wins={winsLlenos}
            factor={ctx.factor}
            proyectos={ctx.proyectos}
            competencias={ctx.competencias}
            cargaAjustada={cargaAjustada}
            planeableMin={bal.planeableMin}
            sinEstimar={sinEstimar.length}
            cargando={cargandoIA === 'estimar'}
            onItem={setItem}
            onAgregar={(titulo, proyecto) =>
              setDraft((d) => ({
                ...d,
                items: [
                  ...d.items,
                  { ref: `n${d.items.length + 1}-${titulo.slice(0, 8)}`, titulo, proyecto, estimadoMin: 0, incluida: true, arrastrada: false },
                ],
              }))
            }
            onIA={() =>
              conIA('estimar', async () => {
                const faltan = draft.items.filter((it) => it.incluida && it.estimadoMin <= 0)
                if (faltan.length === 0) return setError('Todas las tareas incluidas ya tienen estimación.')
                const r = await estimarAction(
                  faltan.map((it) => ({ id: it.ref, titulo: it.titulo, herramienta: it.herramienta, proyecto: it.proyecto }))
                )
                if (!r.ok) return setError(r.error)
                setDraft((d) => ({
                  ...d,
                  items: d.items.map((it) => {
                    const e = r.datos.find((x) => x.id === it.ref)
                    return e?.estimadoMin ? { ...it, estimadoMin: e.estimadoMin } : it
                  }),
                }))
              })
            }
          />
        )}

        {draft.paso === 3 && (
          <PasoBloquear
            items={incluidas}
            capacidad={ctx.capacidad}
            factor={ctx.factor}
            bal={bal}
            cargando={cargandoIA === 'triage'}
            onItem={setItem}
            onIA={() =>
              conIA('triage', async () => {
                const r = await triageAction(
                  incluidas.map((it) => ({
                    id: it.ref,
                    titulo: it.titulo,
                    ajustadoMin: Math.round(it.estimadoMin * ctx.factor),
                    winPosicion: it.winPosicion,
                    deadline: it.deadline,
                  })),
                  bal.cargaMin - bal.planeableMin
                )
                if (!r.ok) return setError(r.error)
                if (r.datos.sacar.length === 0) return setError('La IA no propuso recortes. Saca tareas a mano.')
                const fuera = new Set(r.datos.sacar.map((s) => s.id))
                setDraft((d) => ({ ...d, items: d.items.map((it) => (fuera.has(it.ref) ? { ...it, incluida: false, fecha: undefined } : it)) }))
                setError(r.datos.nota ? `Recorte aplicado: ${r.datos.nota}` : null)
              })
            }
          />
        )}

        {draft.paso === 4 && (
          <PasoPreemptar
            riesgos={draft.riesgos}
            desbloqueador={draft.desbloqueador}
            onChange={(cambio) => set(cambio)}
            cargando={cargandoIA === 'premortem'}
            onIA={() =>
              conIA('premortem', async () => {
                const r = await premortemAction(winsLlenos, bal.cargaMin, bal.planeableMin)
                if (!r.ok) return setError(r.error)
                set({ riesgos: r.datos.riesgos, desbloqueador: r.datos.desbloqueador ?? draft.desbloqueador })
              })
            }
          />
        )}
      </section>

      <footer className="flex items-center justify-between gap-2">
        <button
          disabled={draft.paso === 0}
          onClick={() => set({ paso: draft.paso - 1 })}
          className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-bold text-neutral-600 disabled:opacity-40"
        >
          ← Atrás
        </button>

        <span className="text-xs text-neutral-500">
          {incluidas.length} tareas · {horas(cargaAjustada)} de {horas(bal.planeableMin)}
          {bal.sobrecargado && <strong className="ml-1 text-[#b43232]">se pasa {horas(-bal.colchonMin)}</strong>}
        </span>

        {draft.paso < 4 ? (
          <button
            onClick={() => set({ paso: draft.paso + 1 })}
            className="rounded-full bg-[#0c4a45] px-4 py-2 text-sm font-bold text-white"
          >
            Siguiente →
          </button>
        ) : (
          <button
            disabled={pending || winsLlenos.length === 0 || incluidas.length === 0}
            onClick={() => {
              setError(null)
              startTransition(async () => {
                const tasks: NuevaSemanaTask[] = incluidas.map((it) => ({
                  id: it.id,
                  ref: it.ref,
                  titulo: it.titulo,
                  projectNombre: it.proyecto,
                  winPosicion: it.winPosicion,
                  estimadoMin: it.estimadoMin > 0 ? it.estimadoMin : 30,
                  dod: [],
                  fecha: it.fecha,
                  competenciaId: it.competenciaId,
                }))
                try {
                  localStorage.removeItem(DRAFT_KEY)
                  await crearSemanaAction({
                    reflexion: draft.reflexion || undefined,
                    desbloqueador: draft.desbloqueador || undefined,
                    riesgos: draft.riesgos.length > 0 ? draft.riesgos : undefined,
                    wins: winsLlenos.map((w) => ({ titulo: w.titulo, dod: w.dod || undefined })),
                    tasks,
                  })
                } catch (e) {
                  // Falló el guardado: se devuelve el draft para no perder 10 min de ritual.
                  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
                  setError(e instanceof Error ? e.message : 'No se pudo crear la semana.')
                }
              })
            }}
            className="rounded-full bg-[#e8b94a] px-4 py-2 text-sm font-bold text-[#4a3a10] disabled:opacity-40"
          >
            {pending ? 'Creando…' : '✓ Crear semana'}
          </button>
        )}
      </footer>
    </div>
  )
}

function BotonIA({ onClick, cargando, texto }: { onClick: () => void; cargando: boolean; texto: string }): React.ReactElement {
  return (
    <button
      onClick={onClick}
      disabled={cargando}
      className="rounded-full border border-[#0c4a45] px-3 py-1 text-xs font-bold text-[#0c4a45] hover:bg-[#0c4a45]/10 disabled:opacity-50"
    >
      {cargando ? '⏳ pensando…' : `✨ ${texto}`}
    </button>
  )
}

function PasoReflejar({
  ctx,
  reflexion,
  onChange,
  onIA,
  cargando,
}: {
  ctx: ContextoPlaneacion
  reflexion: string
  onChange: (v: string) => void
  onIA: () => void
  cargando: boolean
}): React.ReactElement {
  const a = ctx.anterior
  return (
    <div className="space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-wide text-[#0c4a45]">1 · Reflejar la semana que terminó</h2>

      {!a ? (
        <p className="text-sm text-neutral-500">No hay semana anterior registrada. Este paso no aplica todavía.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Dato etiqueta="Plan" valor={horas(a.planMin)} />
            <Dato etiqueta="Real" valor={horas(a.realMin)} />
            <Dato
              etiqueta="Factor logrado"
              valor={a.medicionIncompleta ? 'sin medir' : a.factorLogrado !== null ? String(a.factorLogrado) : '—'}
            />
            <Dato etiqueta="Tareas" valor={`${a.tareasHechas}/${a.tareasPlaneadas}`} />
          </dl>
          {a.medicionIncompleta && (
            <p className="rounded-lg bg-[#fdf6e3] px-3 py-2 text-xs text-[#4a3a10]">
              Solo {a.tareasConTiempo} de {a.tareasHechas} tareas terminadas traen cronómetro, así que el factor logrado no dice
              nada sobre tu velocidad — mide cuánto cronometraste.
            </p>
          )}
          <ul className="space-y-1 text-sm">
            {a.wins.map((w) => (
              <li key={w.posicion} className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    w.estatus === 'logrado' ? 'bg-[#15803d] text-white' : w.estatus === 'fallido' ? 'bg-[#b43232] text-white' : 'bg-neutral-200 text-neutral-700'
                  }`}
                >
                  {w.estatus}
                </span>
                <span className="text-neutral-800">{w.titulo}</span>
                <span className="text-xs text-neutral-400">
                  {w.tareasHechas}/{w.tareasTotal}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-semibold uppercase text-neutral-500">Reflexión</label>
        {a && <BotonIA onClick={onIA} cargando={cargando} texto="Redactar con IA" />}
      </div>
      <textarea
        value={reflexion}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder="Qué se logró, qué se atoró, dónde se fue el tiempo…"
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
      />
    </div>
  )
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }): React.ReactElement {
  return (
    <div className="rounded-lg bg-neutral-50 px-3 py-2">
      <dt className="text-[10px] font-bold uppercase text-neutral-500">{etiqueta}</dt>
      <dd className="font-mono text-sm font-semibold text-neutral-900">{valor}</dd>
    </div>
  )
}

function PasoWins({
  wins,
  onChange,
  onIA,
  cargando,
}: {
  wins: WinDraft[]
  onChange: (w: WinDraft[]) => void
  onIA: () => void
  cargando: boolean
}): React.ReactElement {
  function editar(i: number, cambio: Partial<WinDraft>): void {
    onChange(wins.map((w, j) => (i === j ? { ...w, ...cambio } : w)))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-[#0c4a45]">2 · Los 3 Wins de la semana</h2>
        <BotonIA onClick={onIA} cargando={cargando} texto="Sugerir con IA" />
      </div>
      <p className="text-xs text-neutral-500">Un Win es un resultado, no una actividad. Si no se puede declarar logrado o fallido, no es un Win.</p>

      {wins.map((w, i) => (
        <div key={i} className="space-y-1 rounded-lg border border-neutral-200 p-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#e8b94a] px-2 py-0.5 text-[10px] font-bold text-[#4a3a10]">Win {i + 1}</span>
            <input
              value={w.titulo}
              onChange={(e) => editar(i, { titulo: e.target.value })}
              placeholder="Resultado concreto…"
              className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900"
            />
          </div>
          <input
            value={w.dod}
            onChange={(e) => editar(i, { dod: e.target.value })}
            placeholder="¿Cómo sabrás que está logrado?"
            className="w-full rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-900"
          />
        </div>
      ))}
    </div>
  )
}

function PasoVaciar({
  items,
  wins,
  factor,
  proyectos,
  competencias,
  cargaAjustada,
  planeableMin,
  sinEstimar,
  onItem,
  onAgregar,
  onIA,
  cargando,
}: {
  items: Item[]
  wins: WinDraft[]
  factor: number
  proyectos: Array<{ id: string; nombre: string }>
  competencias: CompetenciaPlaneacion[]
  cargaAjustada: number
  planeableMin: number
  sinEstimar: number
  onItem: (ref: string, cambio: Partial<Item>) => void
  onAgregar: (titulo: string, proyecto?: string) => void
  onIA: () => void
  cargando: boolean
}): React.ReactElement {
  const [nuevo, setNuevo] = useState('')
  const [nuevoProy, setNuevoProy] = useState('')

  // El orden ya viene resuelto del servidor (objetivo primero, huecos primero
  // dentro de cada bloque); agrupar aquí solo lo parte en <optgroup> sin
  // reordenarlo — un Map preserva el orden de inserción.
  const grupos = [...competencias.reduce((acc, c) => {
    const lista = acc.get(c.grupo)
    if (lista) lista.push(c)
    else acc.set(c.grupo, [c])
    return acc
  }, new Map<string, CompetenciaPlaneacion[]>())]

  const incluidas = items.filter((it) => it.incluida)
  const etiquetadas = incluidas.filter((it) => it.competenciaId).length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-[#0c4a45]">3 · Vaciar y dimensionar</h2>
        <BotonIA onClick={onIA} cargando={cargando} texto={`Estimar ${sinEstimar || ''} con IA`} />
      </div>
      <p className="text-xs text-neutral-500">
        Estima el tiempo limpio. El factor {factor} se aplica solo: {horas(cargaAjustada)} ajustados de {horas(planeableMin)} planeables.
      </p>
      {grupos.length > 0 && (
        <p className="text-xs text-neutral-500">
          Etiqueta qué competencia ejercita cada tarea: <strong>{etiquetadas}</strong> de {incluidas.length} incluidas.{' '}
          <span className="text-neutral-400">○ = reactivo sin ninguna evidencia todavía.</span>
        </p>
      )}

      <div className="flex gap-1">
        <input
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && nuevo.trim()) {
              onAgregar(nuevo.trim(), nuevoProy || undefined)
              setNuevo('')
            }
          }}
          placeholder="Agregar pendiente nuevo y Enter…"
          className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900"
        />
        <select
          value={nuevoProy}
          onChange={(e) => setNuevoProy(e.target.value)}
          className="rounded border border-neutral-300 bg-white px-1 py-1 text-xs text-neutral-600"
        >
          <option value="">Sin proyecto</option>
          {proyectos.map((p) => (
            <option key={p.id} value={p.nombre}>
              {p.nombre}
            </option>
          ))}
        </select>
      </div>

      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it.ref} className={`flex flex-wrap items-center gap-2 rounded-lg border p-2 ${it.incluida ? 'border-[#0d6d63]/30 bg-white' : 'border-neutral-200 bg-neutral-50'}`}>
            <input
              type="checkbox"
              checked={it.incluida}
              aria-label={`Incluir ${it.titulo}`}
              onChange={(e) => onItem(it.ref, { incluida: e.target.checked })}
            />
            <span className={`min-w-0 flex-1 text-sm ${it.incluida ? 'text-neutral-900' : 'text-neutral-400'}`}>
              {it.titulo}
              {it.arrastrada && (
                <span className="ml-1 rounded bg-[#5b4b8a] px-1 text-[10px] font-bold uppercase text-white">viene de antes</span>
              )}
              {it.proyecto && <span className="ml-1 text-xs text-neutral-400">· {it.proyecto}</span>}
              {it.deadline && <span className="ml-1 rounded bg-[#f5deae] px-1 text-[10px] font-bold text-[#4a3a10]">{it.deadline}</span>}
            </span>
            <input
              type="number"
              min={0}
              step={15}
              value={it.estimadoMin || ''}
              aria-label={`Minutos de ${it.titulo}`}
              onChange={(e) => onItem(it.ref, { estimadoMin: Math.max(0, Number(e.target.value) || 0) })}
              placeholder="min"
              className="w-16 rounded border border-neutral-300 px-1 py-0.5 text-xs text-neutral-900"
            />
            <select
              value={it.winPosicion ?? ''}
              aria-label={`Win de ${it.titulo}`}
              onChange={(e) => onItem(it.ref, { winPosicion: e.target.value ? Number(e.target.value) : undefined })}
              className="rounded border border-neutral-300 bg-white px-1 py-0.5 text-xs text-neutral-600"
            >
              <option value="">Sin Win</option>
              {wins.map((w, i) => (
                <option key={i} value={i + 1}>
                  Win {i + 1}
                </option>
              ))}
            </select>
            {/* Solo en las incluidas: etiquetar lo que se va a sacar de la semana
                no dice nada, y la fila ya trae tres controles. */}
            {it.incluida && grupos.length > 0 && (
              <select
                value={it.competenciaId ?? ''}
                aria-label={`Competencia de ${it.titulo}`}
                onChange={(e) => onItem(it.ref, { competenciaId: e.target.value || undefined })}
                className={`w-full rounded border px-1 py-0.5 text-xs ${
                  it.competenciaId ? 'border-[#0d6d63]/40 bg-[#0d6d63]/5 text-[#0c4a45]' : 'border-neutral-300 bg-white text-neutral-500'
                }`}
              >
                <option value="">Sin competencia</option>
                {grupos.map(([grupo, lista]) => (
                  <optgroup key={grupo} label={grupo}>
                    {lista.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.vacia ? '○ ' : '● '}
                        {c.etiqueta}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}
          </li>
        ))}
        {items.length === 0 && <li className="text-xs text-neutral-400">Backlog vacío. Agrega pendientes arriba.</li>}
      </ul>
    </div>
  )
}

function PasoBloquear({
  items,
  capacidad,
  factor,
  bal,
  onItem,
  onIA,
  cargando,
}: {
  items: Item[]
  capacidad: ContextoPlaneacion['capacidad']
  factor: number
  bal: ReturnType<typeof balance>
  onItem: (ref: string, cambio: Partial<Item>) => void
  onIA: () => void
  cargando: boolean
}): React.ReactElement {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-[#0c4a45]">4 · Bloquear en la semana</h2>
        {bal.sobrecargado && <BotonIA onClick={onIA} cargando={cargando} texto="Proponer recorte con IA" />}
      </div>

      <div
        className={`rounded-lg px-3 py-2 text-sm font-semibold ${
          bal.sobrecargado ? 'bg-red-50 text-[#b43232]' : 'bg-[#d3e4e0] text-[#0c4a45]'
        }`}
      >
        {bal.sobrecargado
          ? `No cabe: ${horas(bal.cargaMin)} de carga contra ${horas(bal.planeableMin)} planeables. Se pasa ${horas(-bal.colchonMin)}.`
          : `Cabe: ${horas(bal.cargaMin)} de carga, colchón de ${horas(bal.colchonMin)}.`}
      </div>

      <dl className="grid grid-cols-5 gap-1 text-center">
        {capacidad.dias.map((d) => {
          const asignado = items.filter((it) => it.fecha === d.fecha).reduce((s, it) => s + Math.round(it.estimadoMin * factor), 0)
          const libre = Math.round(d.horasLibres * 60)
          return (
            <div key={d.fecha} className={`rounded-lg p-1 ${asignado > libre ? 'bg-red-50' : 'bg-neutral-50'}`}>
              <dt className="text-[10px] font-bold uppercase text-neutral-500">{d.fecha.slice(5)}</dt>
              <dd className={`font-mono text-xs font-semibold ${asignado > libre ? 'text-[#b43232]' : 'text-neutral-900'}`}>
                {horas(asignado)}
                <span className="text-neutral-400">/{horas(libre)}</span>
              </dd>
            </div>
          )
        })}
      </dl>

      <p className="text-xs text-neutral-500">
        Elige el día, no la hora: la hora se acomoda en Mi Día con el reflow, que ya conoce tus juntas. Sin día, la tarea entra a
        la semana y espera en pendientes.
      </p>

      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it.ref} className="flex items-center gap-2 rounded-lg border border-neutral-200 p-2">
            <span className="min-w-0 flex-1 text-sm text-neutral-900">{it.titulo}</span>
            <span className="font-mono text-xs text-neutral-500">{horas(Math.round(it.estimadoMin * factor))}</span>
            <select
              value={it.fecha ?? ''}
              aria-label={`Día de ${it.titulo}`}
              onChange={(e) => onItem(it.ref, { fecha: e.target.value || undefined })}
              className="rounded border border-neutral-300 bg-white px-1 py-0.5 text-xs text-neutral-600"
            >
              <option value="">Sin día</option>
              {capacidad.dias.map((d) => (
                <option key={d.fecha} value={d.fecha}>
                  {d.fecha.slice(5)}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PasoPreemptar({
  riesgos,
  desbloqueador,
  onChange,
  onIA,
  cargando,
}: {
  riesgos: Riesgo[]
  desbloqueador: string
  onChange: (cambio: { riesgos?: Riesgo[]; desbloqueador?: string }) => void
  onIA: () => void
  cargando: boolean
}): React.ReactElement {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-[#0c4a45]">5 · Pre-emptar</h2>
        <BotonIA onClick={onIA} cargando={cargando} texto="Pre-mortem con IA" />
      </div>
      <p className="text-xs text-neutral-500">Imagina que la semana terminó y los Wins no se lograron. ¿Qué pasó?</p>

      <ul className="space-y-2">
        {riesgos.map((r, i) => (
          <li key={i} className="rounded-lg border border-neutral-200 p-2">
            <p className="text-sm font-semibold text-neutral-900">⚠ {r.riesgo}</p>
            <p className="text-xs text-neutral-600">→ {r.defensa}</p>
          </li>
        ))}
        {riesgos.length === 0 && <li className="text-xs text-neutral-400">Sin riesgos anotados.</li>}
      </ul>

      <label className="block text-xs font-semibold uppercase text-neutral-500">Desbloqueador</label>
      <input
        value={desbloqueador}
        onChange={(e) => onChange({ desbloqueador: e.target.value })}
        placeholder="La actividad que, hecha primero, destraba el resto…"
        className="w-full rounded-lg border border-[#e8b94a] px-3 py-2 text-sm text-neutral-900"
      />
    </div>
  )
}
