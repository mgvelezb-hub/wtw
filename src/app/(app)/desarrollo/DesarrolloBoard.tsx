'use client'

import { useState, useTransition } from 'react'
import type { DesarrolloView, CompetenciaOpcion, HistorialRiesgos, CompetenciaCobertura } from './service'
import { registrarEvidenciaAction, cerrarRiesgoAction, reabrirRiesgoAction } from './actions'

type BitacoraSerializada = {
  tareas: Array<{ id: string; titulo: string; nota: string | null; minutosReales: number; proyecto: string | null }>
  minutosTotales: number
  desde: string | null
}

function horas(min: number): string {
  if (min <= 0) return '0h'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

// Sección colapsable reusable — la página es larga porque el tablero educa a
// propósito (cada bloque explica su función), no porque haya que amontonarlo
// todo visible a la vez. El header siempre resume lo suficiente para decidir
// si vale la pena abrir.
function Seccion({
  titulo,
  resumen,
  contador,
  defaultAbierto,
  variant = 'default',
  children,
}: {
  titulo: string
  resumen?: string
  contador?: number
  defaultAbierto: boolean
  variant?: 'default' | 'brand' | 'warn'
  children: React.ReactNode
}): React.ReactElement {
  const [abierto, setAbierto] = useState(defaultAbierto)

  const wrapperClase =
    variant === 'brand'
      ? 'rounded-xl border-2 border-brand-deep bg-white shadow-sm'
      : variant === 'warn'
        ? 'rounded-xl border border-warn-border bg-warn-soft'
        : 'rounded-xl border border-neutral-200 bg-white shadow-sm'

  const tituloClase =
    variant === 'warn'
      ? 'text-xs font-bold uppercase tracking-wide text-warn'
      : 'text-xs font-bold uppercase tracking-wide text-brand-deep'

  const resumenClase = variant === 'warn' ? 'mt-0.5 truncate text-xs text-warn' : 'mt-0.5 truncate text-xs text-neutral-500'

  return (
    <section className={wrapperClase}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-start justify-between gap-3 p-4 text-left"
      >
        <span className="min-w-0">
          <h2 className={tituloClase}>{titulo}</h2>
          {resumen && <p className={resumenClase}>{resumen}</p>}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {contador !== undefined && (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-[10px] font-bold text-neutral-500">
              {contador}
            </span>
          )}
          <span className={`text-neutral-400 transition-transform ${abierto ? 'rotate-180' : ''}`} aria-hidden>
            ▾
          </span>
        </span>
      </button>
      {abierto && <div className="px-4 pb-4">{children}</div>}
    </section>
  )
}

// Sub-acordeón para agrupar los huecos por rubro dentro de la sección de
// Huecos — evita la lista plana de 41 reactivos amarillos amontonados.
function SubSeccionRubro({
  rubro,
  competencias,
}: {
  rubro: string
  competencias: CompetenciaCobertura[]
}): React.ReactElement {
  const [abierto, setAbierto] = useState(false)

  return (
    <div className="rounded-lg border border-warn-border/60 bg-white/60">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="text-xs font-semibold text-warn">{rubro}</span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-warn-soft px-1.5 py-0.5 font-mono text-[10px] font-bold text-warn">
            ({competencias.length})
          </span>
          <span className={`text-warn transition-transform ${abierto ? 'rotate-180' : ''}`} aria-hidden>
            ▾
          </span>
        </span>
      </button>
      {abierto && (
        <ul className="space-y-1 px-3 pb-2">
          {competencias.map((c) => (
            <li key={c.id} className="text-sm text-warn">
              {c.texto}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function DesarrolloBoard({
  view,
  opciones,
  bitacora,
  riesgos,
}: {
  view: DesarrolloView
  opciones: CompetenciaOpcion[]
  bitacora: BitacoraSerializada
  riesgos: HistorialRiesgos
}): React.ReactElement {
  const [abierto, setAbierto] = useState(false)
  const [competencyId, setCompetencyId] = useState('')
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [pending, startTransition] = useTransition()

  const pct = view.totalReactivos > 0 ? Math.round((view.totalConEvidencia / view.totalReactivos) * 100) : 0

  const objConEvidencia = view.objetivo ? view.objetivo.reactivos.filter((r) => r.evidenciaCount > 0).length : 0

  // Huecos agrupados por rubro — la usuaria pidió "difícil entender su función",
  // y una lista plana de 41 amarillos era justo eso. GRUPO_INDIVIDUAL vive en
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
    <div className="space-y-6">
      <header>
        <h1 className="text-lg font-bold text-neutral-900">Desarrollo</h1>
        <p className="text-sm text-neutral-500">
          {view.nivelActual ?? '—'} → <strong className="text-brand-deep">{view.nivelObjetivo ?? '—'}</strong> ·{' '}
          {view.totalConEvidencia} de {view.totalReactivos} reactivos con evidencia ({pct}%)
        </p>
        {view.escalafon.length > 0 && (
          <ol className="mt-2 flex flex-wrap items-center gap-1">
            {view.escalafon.map((e, i) => (
              <li key={e.nombre} className="flex items-center gap-1">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    e.esActual
                      ? 'bg-brand-deep text-white'
                      : e.esObjetivo
                        ? 'bg-brand-soft text-brand-deep'
                        : 'bg-neutral-100 text-neutral-500'
                  }`}
                >
                  {e.nombre}
                </span>
                {i < view.escalafon.length - 1 && <span className="text-neutral-300">→</span>}
              </li>
            ))}
          </ol>
        )}

        {view.expectativasObjetivo && (
          <p className="mt-2 rounded-lg bg-brand-soft px-3 py-2 text-xs text-brand-deep">
            <strong>Lo que exige {view.nivelObjetivo}:</strong> {view.expectativasObjetivo}
          </p>
        )}
      </header>

      {view.objetivo && view.objetivo.reactivos.length > 0 && (
        <Seccion
          titulo={`Reactivos de ${view.objetivo.nombre} — instrumento de VP`}
          resumen={`${objConEvidencia}/${view.objetivo.reactivos.length} con evidencia · la medición que decide la promoción`}
          defaultAbierto
          variant="brand"
        >
          <p className="text-xs text-neutral-500">
            Esta es la medición que decide la promoción. Se evalúa en escala de 4: Sobresaliente, Satisfactorio, Se perciben
            brechas, No aplica.
          </p>
          <ul className="mt-2 space-y-2">
            {view.objetivo.reactivos.map((r) => (
              <li key={r.id} className="flex items-start gap-2">
                <span
                  className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                    r.evidenciaCount > 0 ? 'bg-brand-strong text-white' : 'bg-danger text-white'
                  }`}
                >
                  {r.orden}
                </span>
                <span className="text-sm text-neutral-800">
                  {r.texto}
                  <span className="ml-1 text-xs text-neutral-400">
                    {r.evidenciaCount === 0
                      ? '· sin evidencia'
                      : `· ${r.evidenciaCount} evidencia${r.evidenciaCount > 1 ? 's' : ''}${
                          r.diasDesdeUltima !== null ? `, hace ${r.diasDesdeUltima}d` : ''
                        }`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      {view.objetivo && view.objetivo.reactivos.length === 0 && (
        <Seccion titulo={`${view.objetivo.nombre} — sin reactivos cargados`} defaultAbierto variant="warn">
          <p className="text-xs text-warn">
            El documento de VP no publica los reactivos de este nivel. En cuanto existan, se cargan en
            <code className="ml-1">prisma/seed-data/reactivos-nivel.ts</code>.
          </p>
        </Seccion>
      )}

      <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-brand-deep">Registrar evidencia</h2>
          <button
            onClick={() => {
              setAbierto(!abierto)
              setOk(false)
              setError(null)
            }}
            className="rounded-full border border-brand-deep px-3 py-1 text-xs font-bold text-brand-deep hover:bg-brand-deep/10"
          >
            {abierto ? 'Cerrar' : '+ Nueva'}
          </button>
        </div>

        {ok && <p className="mt-2 rounded bg-brand-soft px-3 py-2 text-sm text-brand-deep">Evidencia registrada.</p>}
        {error && (
          <p role="alert" className="mt-2 rounded border border-danger bg-red-50 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        {abierto && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-neutral-500">
              Los reactivos sin evidencia aparecen primero: llenar un hueco vale más que engordar uno que ya tiene cinco.
            </p>
            <select
              value={competencyId}
              onChange={(e) => setCompetencyId(e.target.value)}
              aria-label="Competencia"
              className="w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900"
            >
              <option value="">Elige la competencia…</option>
              {opciones.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.vacia ? '◻ ' : '◼ '}
                  {o.etiqueta}
                </option>
              ))}
            </select>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={3}
              aria-label="Nota de evidencia"
              placeholder="Qué hiciste, cuándo, y por qué demuestra esa competencia…"
              className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900"
            />
            <button
              disabled={pending || competencyId === '' || nota.trim() === ''}
              onClick={() => {
                setError(null)
                startTransition(async () => {
                  try {
                    await registrarEvidenciaAction({ competencyId, nota })
                    setNota('')
                    setCompetencyId('')
                    setAbierto(false)
                    setOk(true)
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'No se pudo registrar.')
                  }
                })
              }}
              className="rounded-full bg-brand-deep px-4 py-1.5 text-sm font-bold text-white disabled:opacity-40"
            >
              {pending ? 'Guardando…' : 'Guardar evidencia'}
            </button>
          </div>
        )}
      </section>

      {view.huecos.length > 0 && (
        <Seccion
          titulo={`Huecos — ${view.huecos.length} reactivos sin evidencia`}
          contador={view.huecos.length}
          variant="warn"
          defaultAbierto={false}
        >
          <p className="text-xs text-warn">Esta es la lista de trabajo real, no la de competencias que ya dominas.</p>
          <div className="mt-2 space-y-2">
            {[...huecosPorRubro.entries()].map(([rubro, competencias]) => (
              <SubSeccionRubro key={rubro} rubro={rubro} competencias={competencias} />
            ))}
          </div>
        </Seccion>
      )}

      <Seccion titulo="Cobertura por grupo" defaultAbierto>
        <ul className="space-y-2">
          {view.grupos.map((g) => {
            const gpct = g.total > 0 ? Math.round((g.conEvidencia / g.total) * 100) : 0
            return (
              <li key={g.grupo}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-neutral-800">{g.grupo}</span>
                  <span className="font-mono text-xs text-neutral-500">
                    {g.conEvidencia}/{g.total}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className={`h-full ${gpct === 0 ? 'bg-danger' : gpct < 50 ? 'bg-warn-border' : 'bg-brand-strong'}`}
                    style={{ width: `${gpct}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      </Seccion>

      <Seccion
        titulo="Pre-mortem — capacidad predictiva"
        resumen={`${riesgos.total} predichos · ${riesgos.cerrados} cerrados`}
        defaultAbierto={false}
      >
        {riesgos.total === 0 ? (
          <p className="text-sm text-neutral-500">
            Sin riesgos registrados todavía. El paso 5 del planeador semanal los genera; se cierran al cerrar la semana.
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded bg-neutral-50 px-2 py-1">
                <dt className="text-[10px] font-bold uppercase text-neutral-500">Predichos</dt>
                <dd className="font-mono text-sm font-semibold text-neutral-900">{riesgos.total}</dd>
              </div>
              <div className="rounded bg-neutral-50 px-2 py-1">
                <dt className="text-[10px] font-bold uppercase text-neutral-500">Ocurrieron</dt>
                <dd className="font-mono text-sm font-semibold text-neutral-900">
                  {riesgos.acertados}/{riesgos.cerrados}
                </dd>
              </div>
              <div className="rounded bg-neutral-50 px-2 py-1">
                <dt className="text-[10px] font-bold uppercase text-neutral-500">Defensa sirvió</dt>
                <dd className="font-mono text-sm font-semibold text-neutral-900">{riesgos.defensasEfectivas}</dd>
              </div>
            </dl>
            {riesgos.abiertos.length > 0 && (
              <>
                <p className="mt-3 text-xs text-neutral-500">
                  Cierra cada riesgo al terminar la semana. Sin cerrarlos, el historial de capacidad predictiva no se llena —
                  y es la evidencia de &ldquo;puede prever complicaciones inherentes al proyecto&rdquo;.
                </p>
                <ul className="mt-2 space-y-2">
                  {riesgos.abiertos.map((r) => (
                    <li key={r.id} className="rounded-lg border border-neutral-200 p-2">
                      <p className="text-sm text-neutral-800">
                        <span className="font-mono text-xs text-neutral-400">{r.isoWeek}</span> ⚠ {r.riesgo}
                      </p>
                      <p className="mt-0.5 text-xs text-neutral-500">Defensa: {r.defensa}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <button
                          disabled={pending}
                          onClick={() => accionRiesgo(() => cerrarRiesgoAction(r.id, true, true))}
                          className="rounded border border-brand-strong px-2 py-0.5 text-[10px] font-bold text-brand-deep disabled:opacity-40"
                        >
                          ocurrió · la defensa sirvió
                        </button>
                        <button
                          disabled={pending}
                          onClick={() => accionRiesgo(() => cerrarRiesgoAction(r.id, true, false))}
                          className="rounded border border-danger px-2 py-0.5 text-[10px] font-bold text-danger disabled:opacity-40"
                        >
                          ocurrió · no sirvió
                        </button>
                        <button
                          disabled={pending}
                          onClick={() => accionRiesgo(() => cerrarRiesgoAction(r.id, false))}
                          className="rounded border border-neutral-300 px-2 py-0.5 text-[10px] font-bold text-neutral-600 disabled:opacity-40"
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
              <ul className="mt-3 space-y-1 border-t border-neutral-100 pt-2">
                {riesgos.cerradosDetalle.map((r) => (
                  <li key={r.id} className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="min-w-0 text-neutral-500">
                      <span className="font-mono text-neutral-400">{r.isoWeek}</span>{' '}
                      {r.ocurrio ? (r.defensaFunciono ? '✓ ocurrió, defensa sirvió' : '✕ ocurrió, defensa falló') : '— no ocurrió'}
                      {' · '}
                      {r.riesgo}
                    </span>
                    <button
                      disabled={pending}
                      onClick={() => accionRiesgo(() => reabrirRiesgoAction(r.id))}
                      className="shrink-0 font-bold text-neutral-400 hover:text-brand-deep disabled:opacity-40"
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

      <Seccion
        titulo="Bitácora de delegación"
        resumen={
          bitacora.tareas.length === 0
            ? undefined
            : `${bitacora.tareas.length} tareas · ${horas(bitacora.minutosTotales)}${bitacora.desde ? ` desde ${bitacora.desde}` : ''}`
        }
        contador={bitacora.tareas.length}
        defaultAbierto={false}
      >
        {bitacora.tareas.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Nada marcado como delegable. En Mi Día, marca las tareas que hiciste tú pero debió hacer un perfil más junior.
          </p>
        ) : (
          <>
            <p className="text-sm text-neutral-700">
              <strong className="font-mono">{horas(bitacora.minutosTotales)}</strong> de trabajo delegable
              {bitacora.desde && <span className="text-neutral-500"> desde {bitacora.desde}</span>} ·{' '}
              {bitacora.tareas.length} tareas
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Esto es el caso de negocio para pedir un reporte — que es el desbloqueo de dos de las tres expectativas de{' '}
              {view.nivelObjetivo ?? 'Gerente'}.
            </p>
            <ul className="mt-2 space-y-1">
              {bitacora.tareas.map((t) => (
                <li key={t.id} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 text-neutral-800">
                    {t.titulo}
                    {t.proyecto && <span className="ml-1 text-xs text-neutral-400">· {t.proyecto}</span>}
                    {t.nota && <span className="ml-1 text-xs text-neutral-500">— {t.nota}</span>}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-neutral-500">{horas(t.minutosReales)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Seccion>
    </div>
  )
}
