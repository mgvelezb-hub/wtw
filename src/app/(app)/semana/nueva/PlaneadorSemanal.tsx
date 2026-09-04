'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ContextoPlaneacion, RecapAnterior } from './service'
import type { CompetenciaPlaneacion } from '@/app/(app)/desarrollo/service'
import { balance, validarCarga, type Balance } from './service'
import { crearSemanaAction, borrarSemanaAction, type NuevaSemanaTask } from './actions'
import { recapAction, sugerirWinsAction, estimarAction, triageAction, premortemAction } from './ai-actions'
import { medidaDe, refDeMedida } from './medidas'
import { TIPO_TRABAJO_LABEL, TIPOS_TRABAJO, factorDeClase } from '@/lib/tipo-trabajo'
import type { TipoTrabajo } from '@prisma/client'

const PASOS = ['Reflejar', 'Wins', 'Vaciar', 'Bloquear', 'Pre-emptar'] as const
const DRAFT_KEY = 'wtw_planeador_draft_v2'

// Solo cambia lo que se muestra, no el valor que compara la lógica (`w.estatus`
// sigue siendo 'fallido' en la DB): "no logrado" es el mismo dato que "fallido"
// sin el tono de indictment — la semana se archiva, no se sentencia.
const ESTATUS_WIN_LABEL: Record<string, string> = {
  logrado: 'logrado',
  fallido: 'no logrado',
  pendiente: 'pendiente',
}

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
  tipoTrabajo?: TipoTrabajo
  /** La clase venía sugerida (no la eligió el humano): se marca en la UI hasta que la confirme. */
  tipoSugerido?: boolean
}

// `siEntonces` y `leverage` son nuevos: un draft guardado antes de este cambio
// no los trae, y `normalizar()` los rellena en vez de bumpear DRAFT_KEY, que
// borraría el ritual en curso de quien esté planeando.
// `leverage` arranca en null —no en false— porque "todavía no lo pensé" y "no
// apalanca" son respuestas distintas, y solo la segunda merece el aviso.
type WinDraft = { titulo: string; dod: string; siEntonces: string; leverage: boolean | null }
// `medida` es opcional: un draft guardado antes de este cambio no la trae, y
// bumpear DRAFT_KEY para "arreglarlo" borraría el ritual en curso de quien esté
// planeando. `medidaDe()` la deriva de la prosa cuando falta.
type Riesgo = { riesgo: string; defensa: string; medida?: { titulo: string; estimadoMin: number } }

type Draft = {
  paso: number
  reflexion: string
  // Cuarta pregunta del AAR. Se guarda pegada al recap (ver `componerReflexion`
  // en service.ts): es la única de las cuatro que produce una decisión.
  queCambias: string
  wins: WinDraft[]
  items: Item[]
  riesgos: Riesgo[]
  desbloqueador: string
}

const WIN_VACIO: WinDraft = { titulo: '', dod: '', siEntonces: '', leverage: null }

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
      if (Array.isArray(parsed?.items) && Array.isArray(parsed?.wins)) return normalizar(parsed)
    }
  } catch {
    // draft corrupto: se arranca limpio en vez de tirar el ritual completo
  }
  return draftInicial(ctx)
}

// Rellena lo que un draft viejo no traía. Sin esto, `w.siEntonces` llega
// `undefined` a un <input> controlado y React lo vuelve no-controlado a media
// escritura.
function normalizar(d: Draft): Draft {
  return {
    ...d,
    queCambias: d.queCambias ?? '',
    wins: d.wins.map((w) => ({ ...WIN_VACIO, ...w })),
  }
}

function draftInicial(ctx: ContextoPlaneacion): Draft {
  return {
    paso: 0,
    reflexion: '',
    queCambias: '',
    wins: [WIN_VACIO, WIN_VACIO, WIN_VACIO],
    items: ctx.backlog.map((t) => ({
      ref: t.id,
      id: t.id,
      titulo: t.titulo,
      proyecto: t.proyecto ?? undefined,
      herramienta: t.herramienta,
      deadline: t.deadline,
      estimadoMin: t.estimadoMin ?? 0,
      // La clase guardada gana; si no hay, entra la sugerida MARCADA como
      // sugerencia — se aplica sola al ajuste pero se ve distinta hasta que Mau
      // la confirme o la cambie.
      tipoTrabajo: t.tipoTrabajo ?? t.tipoSugerido ?? undefined,
      tipoSugerido: !t.tipoTrabajo && t.tipoSugerido !== null,
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
  const router = useRouter()
  const [draft, setDraft] = useState<Draft>(() => leerDraft(ctx))
  const [error, setError] = useState<string | null>(null)
  const [cargandoIA, setCargandoIA] = useState<string | null>(null)
  // Recuerda que el aviso de si-entonces ya se dio: el segundo clic en Siguiente
  // avanza. Vive en estado y no en el draft porque es una interacción, no parte
  // del plan.
  const [avisoWins, setAvisoWins] = useState(false)
  // Borrar un plan es destructivo: dos clics, el patrón que ya usa el resto de
  // la app, en vez de un confirm() nativo.
  const [borrando, setBorrando] = useState(false)
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

  // Estado de las medidas del pre-mortem. Se deriva de `draft.items` en cada
  // render: la fuente de verdad de "ya está en la semana" es la lista de items,
  // porque es la que se manda a crearSemanaAction. Un set paralelo se
  // desincronizaría en cuanto la tarea se quite desde otro paso.
  const medidas = draft.riesgos.map((r, i) => {
    const ref = refDeMedida(i)
    const item = draft.items.find((it) => it.ref === ref)
    const m = medidaDe(r)
    return {
      ref,
      agregada: item !== undefined && item.incluida,
      titulo: item?.titulo ?? m.titulo,
      estimadoMin: item?.estimadoMin ?? m.estimadoMin,
      conDia: item?.fecha !== undefined,
    }
  })

  function toggleMedida(indice: number): void {
    const ref = refDeMedida(indice)
    setDraft((d) => {
      if (d.items.some((it) => it.ref === ref)) {
        return { ...d, items: d.items.filter((it) => it.ref !== ref) }
      }
      const m = medidaDe(d.riesgos[indice])
      return {
        ...d,
        items: [
          ...d.items,
          { ref, titulo: m.titulo, estimadoMin: m.estimadoMin, incluida: true, arrastrada: false },
        ],
      }
    })
  }

  // La edición escribe en `riesgos[i].medida` —que es lo que persiste en el
  // draft— y además al item si ya se agregó. Así editar antes de agregar no se
  // pierde, y editar después no deja los dos valores divergentes.
  function editarMedida(indice: number, cambio: { titulo?: string; estimadoMin?: number }): void {
    setDraft((d) => {
      const base = medidaDe(d.riesgos[indice])
      const medida = { ...base, ...cambio }
      const ref = refDeMedida(indice)
      return {
        ...d,
        riesgos: d.riesgos.map((r, i) => (i === indice ? { ...r, medida } : r)),
        items: d.items.map((it) => (it.ref === ref ? { ...it, ...cambio } : it)),
      }
    })
  }

  const incluidas = draft.items.filter((it) => it.incluida)
  const winsLlenos = draft.wins.filter((w) => w.titulo.trim() !== '')
  // Las tareas sin estimar se guardan con 30 min (ver el payload de abajo), así
  // que la carga se calcula con ese mismo mínimo: contarlas como cero mostraba
  // una carga más chica que la que iba a quedar escrita, y ahora que la carga
  // decide si la semana se puede cerrar, esa diferencia bloquearía en el
  // servidor algo que la pantalla declaró que cabía.
  // El ajuste va por clase: cada tarea se corrige con el factor de su tipo de
  // trabajo, y cae al global donde esa clase no tiene muestras. Antes se
  // multiplicaba la SUMA por el factor global, que diluye lo que ya se sabe: un
  // deck que históricamente sale al doble se planeaba al 1.4 promedio.
  const factorDe = (it: Item) => factorDeClase(it.tipoTrabajo, ctx.factoresClase, ctx.factor)
  const ajustar = (it: Item) => Math.round((it.estimadoMin > 0 ? it.estimadoMin : 30) * factorDe(it))
  const cargaAjustada = incluidas.reduce((s, it) => s + ajustar(it), 0)
  const bal = balance(cargaAjustada, ctx.capacidad)
  const carga = validarCarga(cargaAjustada, ctx.capacidad)
  const sinEstimar = incluidas.filter((it) => it.estimadoMin <= 0)
  // Wins con título pero sin plan si-entonces. La validación es suave: avisa una
  // vez y deja pasar al segundo intento. La IA propone, el humano dispone — un
  // bloqueo duro aquí convertiría el ritual en un formulario.
  const winsSinPlan = winsLlenos.filter((w) => w.siEntonces.trim() === '')

  // El muro decía "primero cierra o borra la semana actual" y no ofrecía ni
  // cerrar ni borrar: era un callejón, y justo el que encontraba quien llegaba
  // aquí desde el recordatorio del ritual. Ahora nombra las salidas.
  if (ctx.yaPlaneada) {
    return (
      <div className="bloque p-6">
        <h1 className="text-lg font-bold text-ink">La semana {ctx.isoWeek} ya está planeada</h1>
        <p className="mt-2 text-sm text-muted">
          Replanear encima duplicaría wins, tareas y bloques. Estas son las salidas:
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link
            href={`/semana/nueva?semana=${ctx.isoWeekSiguiente}`}
            className="rounded-md bg-brand-deep px-4 py-2 text-sm font-bold text-white"
          >
            Planear {ctx.isoWeekSiguiente} →
          </Link>
          <Link
            href="/semana"
            className="rounded-md border border-edge bg-surface px-4 py-2 text-sm font-semibold text-brand-deep"
          >
            Ver mi semana
          </Link>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!borrando) return setBorrando(true)
              startTransition(async () => {
                const r = await borrarSemanaAction(ctx.isoWeek)
                setBorrando(false)
                if ('error' in r) return setError(r.error)
                router.refresh()
              })
            }}
            className={`rounded-md px-3 py-2 text-sm font-semibold disabled:opacity-50 ${
              borrando ? 'bg-danger text-white' : 'text-danger hover:bg-danger-soft'
            }`}
          >
            {borrando ? `Sí, borrar el plan de ${ctx.isoWeek}` : 'Borrar y replanear'}
          </button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-faint">
          Borrar quita los wins, los bloques y el pre-mortem de esa semana. Las tareas no se destruyen: las que tengan
          tiempo medido o evidencia vuelven al backlog con su historia intacta.
        </p>
        {error && (
          <p role="alert" className="mt-2 text-sm font-semibold text-danger">
            {error}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-bold text-brand-deep">Planear la semana {ctx.isoWeek}</h1>
        <p className="text-xs text-muted">
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
                  ? 'bg-brand-deep text-white'
                  : i < draft.paso
                    ? 'bg-brand-soft text-brand-deep'
                    : 'bg-paper text-muted'
              }`}
            >
              {i + 1}. {nombre}
            </button>
          </li>
        ))}
      </ol>

      {error && (
        <p className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <section className="rounded-xl border border-edge bg-surface p-4">
        {draft.paso === 0 && (
          <PasoReflejar
            ctx={ctx}
            reflexion={draft.reflexion}
            queCambias={draft.queCambias}
            onChange={(reflexion) => set({ reflexion })}
            onQueCambias={(queCambias) => set({ queCambias })}
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
            aviso={avisoWins && winsSinPlan.length > 0}
            onChange={(wins) => set({ wins })}
            cargando={cargandoIA === 'wins'}
            onIA={() =>
              conIA('wins', async () => {
                const r = await sugerirWinsAction()
                if (!r.ok) return setError(r.error)
                const sugeridos: WinDraft[] = r.datos.map((w) => ({
                  ...WIN_VACIO,
                  titulo: w.titulo,
                  dod: w.dod ?? '',
                  siEntonces: w.siEntonces ?? '',
                }))
                while (sugeridos.length < 3) sugeridos.push(WIN_VACIO)
                set({ wins: sugeridos })
              })
            }
          />
        )}

        {draft.paso === 2 && (
          <PasoVaciar
            factoresClase={ctx.factoresClase}
            ajustar={ajustar}
            onConfirmarSugerencias={() =>
              setDraft((d) => ({ ...d, items: d.items.map((it) => (it.tipoSugerido ? { ...it, tipoSugerido: false } : it)) }))
            }
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
            ajustar={ajustar}
            bal={bal}
            cargando={cargandoIA === 'triage'}
            onItem={setItem}
            onIA={() =>
              conIA('triage', async () => {
                const r = await triageAction(
                  incluidas.map((it) => ({
                    id: it.ref,
                    titulo: it.titulo,
                    ajustadoMin: ajustar(it),
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
            medidas={medidas}
            factor={ctx.factor}
            bal={bal}
            onToggleMedida={toggleMedida}
            onEditarMedida={editarMedida}
            onIrAlPaso={(paso) => set({ paso })}
            onChange={(cambio) => set(cambio)}
            cargando={cargandoIA === 'premortem'}
            onIA={() =>
              conIA('premortem', async () => {
                const r = await premortemAction(winsLlenos, bal.cargaMin, bal.planeableMin)
                if (!r.ok) return setError(r.error)
                // Los riesgos se reemplazan, así que las medidas que ya se
                // habían agregado quedarían colgando de riesgos que ya no
                // existen —y con el título del anterior. Se retiran junto con
                // ellos; volver a seleccionarlas es un clic.
                setDraft((d) => ({
                  ...d,
                  riesgos: r.datos.riesgos,
                  desbloqueador: r.datos.desbloqueador ?? d.desbloqueador,
                  items: d.items.filter((it) => !d.riesgos.some((_, i) => refDeMedida(i) === it.ref)),
                }))
              })
            }
          />
        )}
      </section>

      {/* El bloqueo se explica AQUÍ, junto al botón que deshabilita: un botón
          apagado sin razón visible es exactamente el bloqueo silencioso que la
          app no debe hacer. */}
      {draft.paso === 4 && !carga.ok && (
        <p className="rounded-lg border border-warn-border bg-warn-soft px-3 py-2 text-sm text-warn" role="alert">
          {carga.mensaje}{' '}
          <button onClick={() => set({ paso: 3 })} className="font-bold underline">
            Ir al paso 4 a recortar
          </button>
        </p>
      )}

      <footer className="flex items-center justify-between gap-2">
        <button
          disabled={draft.paso === 0}
          onClick={() => set({ paso: draft.paso - 1 })}
          className="rounded-md border border-hair px-4 py-2 text-sm font-bold text-muted disabled:opacity-40"
        >
          ← Atrás
        </button>

        <span className="text-xs text-muted">
          {incluidas.length} tareas · {horas(cargaAjustada)} de {horas(bal.planeableMin)}
          {bal.sobrecargado && <strong className="ml-1 text-warn">se pasa {horas(-bal.colchonMin)}</strong>}
        </span>

        {draft.paso < 4 ? (
          <button
            onClick={() => {
              // Paso 2: si algún Win no trae si-entonces, el primer clic avisa y
              // no avanza; el segundo avanza igual. El plan es de Mau, no del
              // wizard — pero no se le pasa de largo en silencio.
              if (draft.paso === 1 && winsSinPlan.length > 0 && !avisoWins) return setAvisoWins(true)
              setAvisoWins(false)
              set({ paso: draft.paso + 1 })
            }}
            className="rounded-md bg-brand-deep px-4 py-2 text-sm font-bold text-white"
          >
            {draft.paso === 1 && winsSinPlan.length > 0 && avisoWins ? 'Avanzar sin si-entonces →' : 'Siguiente →'}
          </button>
        ) : (
          <button
            disabled={pending || winsLlenos.length === 0 || incluidas.length === 0 || !carga.ok}
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
                  tipoTrabajo: it.tipoTrabajo,
                }))
                let creada = false
                try {
                  localStorage.removeItem(DRAFT_KEY)
                  await crearSemanaAction({
                    isoWeek: ctx.isoWeek,
                    reflexion: draft.reflexion || undefined,
                    queCambias: draft.queCambias || undefined,
                    desbloqueador: draft.desbloqueador || undefined,
                    riesgos: draft.riesgos.length > 0 ? draft.riesgos : undefined,
                    wins: winsLlenos.map((w) => ({
                      titulo: w.titulo,
                      dod: w.dod || undefined,
                      siEntonces: w.siEntonces.trim() || undefined,
                    })),
                    tasks,
                  })
                  creada = true
                } catch (e) {
                  // Falló el guardado: se devuelve el draft para no perder 10 min de ritual.
                  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
                  setError(e instanceof Error ? e.message : 'No se pudo crear la semana.')
                }
                // La navegación va FUERA del try. Antes la action terminaba con
                // `redirect()`, que Next implementa lanzando NEXT_REDIRECT, y este
                // mismo catch se lo tragaba: la semana se creaba pero el planeador
                // se quedaba mostrando un error falso.
                if (creada) router.push('/semana')
              })
            }}
            // Antes ámbar (color de advertencia): un botón primario es una acción,
            // y la gramática reserva el ámbar solo para advertencias — nunca botones.
            className="rounded-md bg-brand-deep px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
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
      className="rounded-md border border-brand-deep px-3 py-1 text-xs font-bold text-brand-deep hover:bg-brand-deep/10 disabled:opacity-50"
    >
      {cargando ? '⏳ pensando…' : `✨ ${texto}`}
    </button>
  )
}

// El paso 1 es un After Action Review, no un tablero de números. Las cuatro
// preguntas —esperado, ocurrido, brecha, cambio— son lo que carga el efecto: el
// contraste explícito entre lo que se esperaba y lo que pasó es lo que produce
// aprendizaje, y sin la cuarta pregunta el ejercicio termina en descripción.
// Las tres primeras las contesta el servidor con datos objetivos; la cuarta la
// contesta Mau y es la única que se guarda como decisión.
function PasoReflejar({
  ctx,
  reflexion,
  queCambias,
  onChange,
  onQueCambias,
  onIA,
  cargando,
}: {
  ctx: ContextoPlaneacion
  reflexion: string
  queCambias: string
  onChange: (v: string) => void
  onQueCambias: (v: string) => void
  onIA: () => void
  cargando: boolean
}): React.ReactElement {
  const a = ctx.anterior
  return (
    <div className="space-y-3">
      <h2 className="lbl text-brand-deep">1 · Reflejar: el AAR de la semana que terminó</h2>

      {!a ? (
        <p className="text-sm text-muted">No hay semana anterior registrada. Este paso no aplica todavía.</p>
      ) : (
        <>
          {/* La semana pasada ya quedó archivada — este paso no la reabre ni la
              califica, la lee como el único insumo real para calibrar la que
              sigue. Una semana con Wins fallidos o factor alto no es una racha
              rota: es más dato, no menos. */}
          <p className="text-xs text-muted">
            La semana pasada está archivada. Estos números no son un veredicto — son la calibración de esta semana.
          </p>

          <Pregunta n={1} texto="¿Qué esperabas?">
            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <Dato etiqueta="Plan" valor={horas(a.planMin)} />
              <Dato etiqueta="Tareas planeadas" valor={String(a.tareasPlaneadas)} />
              <Dato etiqueta="Factor usado" valor={String(a.factorUsado)} />
            </dl>
            <ul className="mt-2 space-y-1 text-sm">
              {a.wins.map((w) => (
                <li key={w.posicion} className="text-ink">
                  <span className="text-faint">Win {w.posicion} ·</span> {w.titulo}
                </li>
              ))}
              {a.wins.length === 0 && <li className="text-xs text-faint">Esa semana no comprometió Wins.</li>}
            </ul>
          </Pregunta>

          <Pregunta n={2} texto="¿Qué pasó?">
            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <Dato etiqueta="Real" valor={horas(a.realMin)} />
              <Dato etiqueta="Tareas hechas" valor={`${a.tareasHechas}/${a.tareasPlaneadas}`} />
              <Dato
                etiqueta="Factor logrado"
                valor={a.medicionIncompleta ? 'sin medir' : a.factorLogrado !== null ? String(a.factorLogrado) : '—'}
              />
            </dl>
            {a.medicionIncompleta && (
              <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
                Solo {a.tareasConTiempo} de {a.tareasHechas} tareas terminadas traen cronómetro, así que el factor logrado no dice
                nada sobre tu velocidad — mide cuánto cronometraste.
              </p>
            )}
            <ul className="mt-2 space-y-1 text-sm">
              {a.wins.map((w) => (
                <li key={w.posicion} className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      w.estatus === 'logrado' ? 'bg-ok text-white' : w.estatus === 'fallido' ? 'bg-danger text-white' : 'bg-hair text-muted'
                    }`}
                  >
                    {ESTATUS_WIN_LABEL[w.estatus] ?? w.estatus}
                  </span>
                  <span className="text-ink">{w.titulo}</span>
                  <span className="text-xs text-faint">
                    {w.tareasHechas}/{w.tareasTotal}
                  </span>
                </li>
              ))}
            </ul>
            {a.tareasSinTerminar.length > 0 && (
              <p className="mt-2 text-xs text-muted">Quedó abierto: {a.tareasSinTerminar.join(' · ')}</p>
            )}
          </Pregunta>

          <Pregunta n={3} texto="¿Por qué la brecha?">
            <Brecha desvios={a.desvios} premortem={a.premortem} />
          </Pregunta>
        </>
      )}

      <div className="flex items-center justify-between gap-2">
        <label className="lbl">Narrativa del AAR</label>
        {a && <BotonIA onClick={onIA} cargando={cargando} texto="Redactar con IA" />}
      </div>
      <textarea
        value={reflexion}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder="Qué esperabas, qué pasó, por qué la brecha…"
        className="w-full rounded-lg border border-hair px-3 py-2 text-sm text-ink"
      />

      {/* La cuarta pregunta va con el acento de marca y no dentro del bloque de
          datos: es la única que produce una decisión, y la única que la IA no
          contesta. */}
      <div className="rounded-lg border border-brand/40 bg-brand/5 p-3">
        <label htmlFor="que-cambias" className="lbl text-brand-deep">
          4 · ¿Qué cambias esta semana?
        </label>
        <p className="mt-0.5 text-xs text-muted">
          Un cambio, concreto y observable. Sin esto el AAR se queda en descripción y la semana repite la brecha.
        </p>
        <input
          id="que-cambias"
          value={queCambias}
          onChange={(e) => onQueCambias(e.target.value)}
          placeholder="Ej. no agendo juntas antes de las 11 para proteger el bloque de análisis"
          className="mt-2 w-full rounded border border-brand/40 px-2 py-1.5 text-sm text-ink"
        />
      </div>
    </div>
  )
}

function Pregunta({ n, texto, children }: { n: number; texto: string; children: React.ReactNode }): React.ReactElement {
  return (
    <section className="hair pt-3">
      <h3 className="lbl">
        {n} · {texto}
      </h3>
      <div className="mt-2">{children}</div>
    </section>
  )
}

function Brecha({
  desvios,
  premortem,
}: {
  desvios: RecapAnterior['desvios']
  premortem: RecapAnterior['premortem']
}): React.ReactElement {
  return (
    <div className="space-y-2 text-sm">
      {desvios.diasReconciliados === 0 ? (
        // Decirlo explícito importa: sin reconciliación la causa NO está medida,
        // y la alternativa —inventar una explicación plausible— es justo lo que
        // el AAR sobre datos objetivos existe para evitar.
        <p className="text-xs text-muted">
          Ningún día de esa semana se reconcilió, así que la causa de la brecha no está medida. Cerrar el día en{' '}
          <span className="font-semibold">/cierre</span> es lo que la vuelve dato.
        </p>
      ) : desvios.totalMin === 0 ? (
        <p className="text-xs text-muted">
          {desvios.diasReconciliados} día(s) reconciliados y ningún desvío registrado: el plan no se rompió por ninguna causa
          clasificada.
        </p>
      ) : (
        <>
          <ul className="space-y-1">
            {desvios.porCausa.map((c) => (
              <li key={c.causa} className="flex items-center justify-between gap-2">
                <span className="text-ink">
                  {c.label}
                  <span className="ml-1 text-xs text-faint">le toca a {c.aQuienToca}</span>
                </span>
                <span className="shrink-0 num text-xs text-muted">
                  {horas(c.minutos)} · {c.pct}%
                </span>
              </li>
            ))}
          </ul>
          {desvios.dominante && (
            <p className="rounded-lg bg-paper px-3 py-2 text-xs text-muted">
              Causa dominante: <strong>{desvios.dominante.label}</strong> — le toca a {desvios.dominante.aQuienToca}.
            </p>
          )}
        </>
      )}

      {premortem.predichos === 0 ? (
        <p className="text-xs text-faint">Esa semana no hizo pre-mortem, así que no hay predicción que evaluar.</p>
      ) : premortem.cerrados === 0 ? (
        <p className="text-xs text-muted">
          {premortem.predichos} riesgo(s) predichos, ninguno evaluado al cerrar la semana: la predicción quedó sin veredicto.
        </p>
      ) : (
        <p className="rounded-lg bg-paper px-3 py-2 text-xs text-muted">
          Pre-mortem: predijiste <strong>{premortem.predichos}</strong>, ocurrieron <strong>{premortem.ocurrieron}</strong> de los{' '}
          {premortem.cerrados} evaluados, y la defensa sirvió en <strong>{premortem.defensasSirvieron}</strong>.
        </p>
      )}
    </div>
  )
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }): React.ReactElement {
  return (
    <div className="rounded-lg bg-paper px-3 py-2">
      <dt className="lbl text-[10px]">{etiqueta}</dt>
      <dd className="num text-sm font-semibold text-ink">{valor}</dd>
    </div>
  )
}

function PasoWins({
  wins,
  aviso,
  onChange,
  onIA,
  cargando,
}: {
  wins: WinDraft[]
  // true cuando ya se intentó avanzar dejando Wins sin si-entonces.
  aviso: boolean
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
        <h2 className="lbl text-brand-deep">2 · Los 3 Wins de la semana</h2>
        <BotonIA onClick={onIA} cargando={cargando} texto="Sugerir con IA" />
      </div>
      <p className="text-xs text-muted">Un Win es un resultado, no una actividad. Si no se puede declarar logrado o fallido, no es un Win.</p>

      {aviso && (
        <p className="rounded-lg border border-warn-border bg-warn-soft px-3 py-2 text-sm text-warn" role="alert">
          Hay Wins sin plan si-entonces. Un Win con la respuesta ya decidida antes del obstáculo se cumple mucho más seguido que
          uno con pura intención — escríbelo, o vuelve a dar Siguiente para avanzar sin él.
        </p>
      )}

      {wins.map((w, i) => (
        <div key={i} className="space-y-1 rounded-lg border border-hair p-3">
          <div className="flex items-center gap-2">
            {/* Chip decorativo (numeración, no advertencia): la gramática de
                color reserva warn para advertencias reales, así que usa el
                acento de marca en vez de ámbar. */}
            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold text-brand-deep">Win {i + 1}</span>
            <input
              value={w.titulo}
              onChange={(e) => editar(i, { titulo: e.target.value })}
              placeholder="Resultado concreto…"
              className="flex-1 rounded border border-hair px-2 py-1 text-sm text-ink"
            />
          </div>
          <input
            value={w.dod}
            onChange={(e) => editar(i, { dod: e.target.value })}
            placeholder="¿Cómo sabrás que está logrado?"
            className="w-full rounded border border-hair px-2 py-1 text-xs text-ink"
          />

          {/* Solo aparece cuando el Win existe: pedir el plan de un Win vacío es
              ruido, y son tres cajas por Win. */}
          {w.titulo.trim() !== '' && (
            <>
              <input
                value={w.siEntonces}
                aria-label={`Plan si-entonces del Win ${i + 1}`}
                onChange={(e) => editar(i, { siEntonces: e.target.value })}
                placeholder="Si [obstáculo], entonces [acción]…"
                className={`w-full rounded border px-2 py-1 text-xs text-ink ${
                  w.siEntonces.trim() === '' && aviso ? 'border-warn-border bg-warn-soft' : 'border-hair'
                }`}
              />

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs text-muted">¿Esto hace la próxima semana ≥1% más fácil?</span>
                <button
                  type="button"
                  aria-pressed={w.leverage === true}
                  onClick={() => editar(i, { leverage: w.leverage === true ? null : true })}
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    w.leverage === true ? 'bg-brand-deep text-white' : 'border border-hair text-muted'
                  }`}
                >
                  Sí
                </button>
                <button
                  type="button"
                  aria-pressed={w.leverage === false}
                  onClick={() => editar(i, { leverage: w.leverage === false ? null : false })}
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    w.leverage === false ? 'bg-brand-deep text-white' : 'border border-hair text-muted'
                  }`}
                >
                  No
                </button>
              </div>
              {/* No se prohíbe: se nombra. Un Win que no deja nada instalado
                  puede seguir siendo el Win correcto de la semana —un entregable
                  con fecha lo es— pero conviene haberlo decidido a propósito. */}
              {w.leverage === false && (
                <p className="text-xs text-muted">
                  Considera si es un Win o solo una tarea grande: un Win deja algo instalado —un proceso, una plantilla, una
                  decisión— que la semana siguiente ya no vuelve a costar.
                </p>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  )
}

function PasoVaciar({
  items,
  wins,
  factor,
  factoresClase,
  ajustar,
  proyectos,
  competencias,
  cargaAjustada,
  planeableMin,
  sinEstimar,
  onItem,
  onAgregar,
  onConfirmarSugerencias,
  onIA,
  cargando,
}: {
  items: Item[]
  wins: WinDraft[]
  factor: number
  factoresClase: ContextoPlaneacion['factoresClase']
  ajustar: (it: Item) => number
  proyectos: Array<{ id: string; nombre: string }>
  competencias: CompetenciaPlaneacion[]
  cargaAjustada: number
  planeableMin: number
  sinEstimar: number
  onItem: (ref: string, cambio: Partial<Item>) => void
  onAgregar: (titulo: string, proyecto?: string) => void
  onConfirmarSugerencias: () => void
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
  const sugeridas = incluidas.filter((it) => it.tipoSugerido && it.tipoTrabajo).length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="lbl text-brand-deep">3 · Vaciar y dimensionar</h2>
        <BotonIA onClick={onIA} cargando={cargando} texto={`Estimar ${sinEstimar || ''} con IA`} />
      </div>
      <p className="text-xs text-muted">
        Estima el tiempo limpio. El factor se aplica solo, y por CLASE de trabajo donde ya hay histórico ({factor} en lo
        demás): {horas(cargaAjustada)} ajustados de {horas(planeableMin)} planeables.
      </p>
      {sugeridas > 0 && (
        <p className="text-xs text-warn">
          <strong>{sugeridas}</strong> {sugeridas === 1 ? 'clase sugerida' : 'clases sugeridas'} por el título (marcadas en
          ámbar). Ya cuentan para el ajuste — revísalas o
          <button onClick={onConfirmarSugerencias} className="ml-1 font-bold underline">
            confirma todas
          </button>
          .
        </p>
      )}
      {grupos.length > 0 && (
        <p className="text-xs text-muted">
          Etiqueta qué competencia ejercita cada tarea: <strong>{etiquetadas}</strong> de {incluidas.length} incluidas.{' '}
          <span className="text-faint">○ = reactivo sin ninguna evidencia todavía.</span>
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
          className="flex-1 rounded border border-hair px-2 py-1 text-sm text-ink"
        />
        <select
          value={nuevoProy}
          onChange={(e) => setNuevoProy(e.target.value)}
          className="rounded border border-edge bg-surface px-1 py-1 text-xs text-muted"
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
          <li key={it.ref} className={`flex flex-wrap items-center gap-2 rounded-lg border p-2 ${it.incluida ? 'border-brand/30 bg-surface' : 'border-hair bg-paper'}`}>
            <input
              type="checkbox"
              checked={it.incluida}
              aria-label={`Incluir ${it.titulo}`}
              onChange={(e) => onItem(it.ref, { incluida: e.target.checked })}
            />
            <span className={`min-w-0 flex-1 text-sm ${it.incluida ? 'text-ink' : 'text-faint'}`}>
              {it.titulo}
              {it.arrastrada && (
                <span className="ml-1 rounded bg-[#5b4b8a] px-1 text-[10px] font-bold uppercase text-white">viene de antes</span>
              )}
              {it.proyecto && <span className="ml-1 text-xs text-faint">· {it.proyecto}</span>}
              {it.deadline && <span className="ml-1 rounded bg-warn-soft px-1 text-[10px] font-bold text-warn">{it.deadline}</span>}
            </span>
            <input
              type="number"
              min={0}
              step={15}
              value={it.estimadoMin || ''}
              aria-label={`Minutos de ${it.titulo}`}
              onChange={(e) => onItem(it.ref, { estimadoMin: Math.max(0, Number(e.target.value) || 0) })}
              placeholder="min"
              className="w-16 rounded border border-hair px-1 py-0.5 text-xs text-ink"
            />
            <select
              value={it.winPosicion ?? ''}
              aria-label={`Win de ${it.titulo}`}
              onChange={(e) => onItem(it.ref, { winPosicion: e.target.value ? Number(e.target.value) : undefined })}
              className="rounded border border-edge bg-surface px-1 py-0.5 text-xs text-muted"
            >
              <option value="">Sin Win</option>
              {wins.map((w, i) => (
                <option key={i} value={i + 1}>
                  Win {i + 1}
                </option>
              ))}
            </select>
            {/* Clase de trabajo: es lo que decide con qué factor se corrige esta
                tarea, así que se muestra el factor que va a aplicar. Ámbar =
                sugerida por el título, todavía sin confirmar. */}
            {it.incluida && (
              <span className="flex items-center gap-1">
                <select
                  value={it.tipoTrabajo ?? ''}
                  aria-label={`Clase de trabajo de ${it.titulo}`}
                  onChange={(e) =>
                    onItem(it.ref, {
                      tipoTrabajo: (e.target.value || undefined) as TipoTrabajo | undefined,
                      tipoSugerido: false,
                    })
                  }
                  className={`rounded border px-1 py-0.5 text-xs ${
                    it.tipoSugerido && it.tipoTrabajo
                      ? 'border-warn-border bg-warn-soft text-warn'
                      : it.tipoTrabajo
                        ? 'border-brand/40 bg-brand/5 text-brand-deep'
                        : 'border-edge bg-surface text-muted'
                  }`}
                >
                  <option value="">Sin clase</option>
                  {TIPOS_TRABAJO.map((t) => (
                    <option key={t} value={t}>
                      {TIPO_TRABAJO_LABEL[t]}
                    </option>
                  ))}
                </select>
                <span className="num text-[10px] text-faint" title="Factor que aplica a esta tarea">
                  ×{factorDeClase(it.tipoTrabajo, factoresClase, factor)} = {horas(ajustar(it))}
                </span>
              </span>
            )}

            {/* Solo en las incluidas: etiquetar lo que se va a sacar de la semana
                no dice nada, y la fila ya trae tres controles. */}
            {it.incluida && grupos.length > 0 && (
              <select
                value={it.competenciaId ?? ''}
                aria-label={`Competencia de ${it.titulo}`}
                onChange={(e) => onItem(it.ref, { competenciaId: e.target.value || undefined })}
                className={`w-full rounded border px-1 py-0.5 text-xs ${
                  it.competenciaId ? 'border-brand/40 bg-brand/5 text-brand-deep' : 'border-edge bg-surface text-muted'
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
        {items.length === 0 && <li className="text-xs text-faint">Backlog vacío. Agrega pendientes arriba.</li>}
      </ul>
    </div>
  )
}

function PasoBloquear({
  items,
  capacidad,
  ajustar,
  bal,
  onItem,
  onIA,
  cargando,
}: {
  items: Item[]
  capacidad: ContextoPlaneacion['capacidad']
  ajustar: (it: Item) => number
  bal: ReturnType<typeof balance>
  onItem: (ref: string, cambio: Partial<Item>) => void
  onIA: () => void
  cargando: boolean
}): React.ReactElement {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="lbl text-brand-deep">4 · Bloquear en la semana</h2>
        {bal.sobrecargado && <BotonIA onClick={onIA} cargando={cargando} texto="Proponer recorte con IA" />}
      </div>

      <div
        className={`rounded-lg px-3 py-2 text-sm ${bal.sobrecargado ? 'bg-warn-soft text-warn' : 'bg-brand-soft text-brand-deep'}`}
      >
        {bal.sobrecargado ? (
          <>
            <span className="font-semibold">
              No cabe: {horas(bal.cargaMin)} de carga contra {horas(bal.planeableMin)} planeables. Hay que mover{' '}
              {horas(-bal.colchonMin)}.
            </span>{' '}
            {/* Lo planeable ya trae descontado el buffer de Settings; el mensaje
                dice POR QUÉ ese límite existe en vez de solo señalar el exceso. */}
            El plan al 100% degrada la capacidad de la semana siguiente — recorta {horas(-bal.colchonMin)} o desmarca esas tareas
            en el paso 3 para dejarlas en backlog.
          </>
        ) : (
          <span className="font-semibold">
            Cabe: {horas(bal.cargaMin)} de carga, colchón de {horas(bal.colchonMin)}.
          </span>
        )}
      </div>

      <dl className="grid grid-cols-5 gap-1 text-center">
        {capacidad.dias.map((d) => {
          const asignado = items.filter((it) => it.fecha === d.fecha).reduce((s, it) => s + ajustar(it), 0)
          const libre = Math.round(d.horasLibres * 60)
          // Un día sobreasignado es una advertencia, no algo destructivo ni
          // atrasado: ámbar, que es lo que la gramática de color reserva para
          // advertencias.
          return (
            <div key={d.fecha} className={`rounded-lg p-1 ${asignado > libre ? 'bg-warn-soft' : 'bg-paper'}`}>
              <dt className="lbl text-[10px]">{d.fecha.slice(5)}</dt>
              <dd className={`num text-xs font-semibold ${asignado > libre ? 'text-warn' : 'text-ink'}`}>
                {horas(asignado)}
                <span className="text-faint">/{horas(libre)}</span>
              </dd>
            </div>
          )
        })}
      </dl>

      <p className="text-xs text-muted">
        Elige el día, no la hora: la hora se acomoda en Mi Día con el reflow, que ya conoce tus juntas. Sin día, la tarea entra a
        la semana y espera en pendientes.
      </p>

      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it.ref} className="flex items-center gap-2 rounded-lg border border-hair p-2">
            <span className="min-w-0 flex-1 text-sm text-ink">{it.titulo}</span>
            <span className="num text-xs text-muted">{horas(ajustar(it))}</span>
            <select
              value={it.fecha ?? ''}
              aria-label={`Día de ${it.titulo}`}
              onChange={(e) => onItem(it.ref, { fecha: e.target.value || undefined })}
              className="rounded border border-edge bg-surface px-1 py-0.5 text-xs text-muted"
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
  medidas,
  factor,
  bal,
  onChange,
  onToggleMedida,
  onEditarMedida,
  onIrAlPaso,
  onIA,
  cargando,
}: {
  riesgos: Riesgo[]
  desbloqueador: string
  // Estado de cada medida en el draft: si ya es un item, con qué título y minutos,
  // y si tiene día asignado. Se deriva de `draft.items`, no se guarda aparte —
  // dos fuentes de verdad para lo mismo se desincronizan.
  medidas: Array<{ ref: string; agregada: boolean; titulo: string; estimadoMin: number; conDia: boolean }>
  factor: number
  bal: Balance
  onChange: (cambio: { riesgos?: Riesgo[]; desbloqueador?: string }) => void
  onToggleMedida: (indice: number) => void
  onEditarMedida: (indice: number, cambio: { titulo?: string; estimadoMin?: number }) => void
  onIrAlPaso: (paso: number) => void
  onIA: () => void
  cargando: boolean
}): React.ReactElement {
  const agregadas = medidas.filter((m) => m.agregada)
  const faltanDia = agregadas.filter((m) => !m.conDia).length
  const todasAgregadas = medidas.length > 0 && agregadas.length === medidas.length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="lbl text-brand-deep">5 · Pre-emptar</h2>
        <BotonIA onClick={onIA} cargando={cargando} texto="Pre-mortem con IA" />
      </div>
      <p className="text-xs text-muted">Imagina que la semana terminó y los Wins no se lograron. ¿Qué pasó?</p>

      {riesgos.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-brand-deep/5 px-2 py-1.5">
          <span className="text-xs text-muted">
            {agregadas.length > 0 ? (
              <>
                <strong className="text-brand-deep">{agregadas.length}</strong> de {medidas.length} medidas en la semana ·{' '}
                {horas(Math.round(agregadas.reduce((s, m) => s + m.estimadoMin, 0) * factor))} ajustados
              </>
            ) : (
              <>Una defensa que no entra al plan no se ejecuta. Selecciona las que sí vas a hacer.</>
            )}
          </span>
          <button
            onClick={() => medidas.forEach((m, i) => (todasAgregadas ? m.agregada : !m.agregada) && onToggleMedida(i))}
            className="rounded-md border border-brand-deep px-2 py-0.5 text-xs font-bold text-brand-deep hover:bg-brand-deep/10"
          >
            {todasAgregadas ? 'Quitar todas' : 'Agregar todas'}
          </button>
        </div>
      )}

      <ul className="space-y-2">
        {riesgos.map((r, i) => {
          const m = medidas[i]
          return (
            <li
              key={i}
              className={`rounded-lg border p-2 ${m?.agregada ? 'border-brand/50 bg-brand/5' : 'border-hair'}`}
            >
              <p className="text-sm font-semibold text-ink">⚠ {r.riesgo}</p>
              <p className="mt-0.5 text-xs text-muted">→ {r.defensa}</p>

              {m && (
                <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-hair pt-2">
                  <input
                    type="checkbox"
                    checked={m.agregada}
                    aria-label={`Agregar la medida del riesgo ${i + 1} a la semana`}
                    onChange={() => onToggleMedida(i)}
                  />
                  <input
                    value={m.titulo}
                    aria-label={`Título de la medida del riesgo ${i + 1}`}
                    onChange={(e) => onEditarMedida(i, { titulo: e.target.value })}
                    className="min-w-40 flex-1 rounded border border-hair px-2 py-0.5 text-xs text-ink"
                  />
                  <input
                    type="number"
                    min={0}
                    step={15}
                    value={m.estimadoMin || ''}
                    aria-label={`Minutos de la medida del riesgo ${i + 1}`}
                    onChange={(e) => onEditarMedida(i, { estimadoMin: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-16 rounded border border-hair px-1 py-0.5 text-xs text-ink"
                  />
                  <span className="text-xs text-faint">min</span>
                </div>
              )}
            </li>
          )
        })}
        {riesgos.length === 0 && <li className="text-xs text-faint">Sin riesgos anotados.</li>}
      </ul>

      {/* La carga se muestra AQUÍ y no solo en el pie: los pasos 3 y 4 existen
          para que la semana sea realista, y agregar medidas después del triage
          sin ver el efecto es exactamente cómo se sobrecarga una semana. */}
      {agregadas.length > 0 && (
        <div
          className={`rounded-lg px-2 py-1.5 text-xs ${
            bal.sobrecargado ? 'bg-warn-soft text-warn' : 'bg-brand-soft text-brand-deep'
          }`}
        >
          {bal.sobrecargado ? (
            <>
              Con las medidas dentro te pasas <strong>{horas(-bal.colchonMin)}</strong> de lo planeable, y la semana no se puede
              cerrar así. Quita una medida, o vuelve al{' '}
              <button onClick={() => onIrAlPaso(3)} className="underline">
                paso 4
              </button>{' '}
              y saca otra tarea.
            </>
          ) : (
            <>
              Cabe: quedan <strong>{horas(bal.colchonMin)}</strong> de colchón.
            </>
          )}
          {faltanDia > 0 && (
            <>
              {' '}
              {faltanDia === 1 ? 'Una medida no tiene' : `${faltanDia} medidas no tienen`} día asignado —{' '}
              <button onClick={() => onIrAlPaso(3)} className="underline">
                asígnalo en el paso 4
              </button>{' '}
              o queda en el parking lot de Mi Día.
            </>
          )}
        </div>
      )}

      <label className="block lbl">Desbloqueador</label>
      <input
        value={desbloqueador}
        onChange={(e) => onChange({ desbloqueador: e.target.value })}
        placeholder="La actividad que, hecha primero, destraba el resto…"
        className="w-full rounded-lg border border-warn-border px-3 py-2 text-sm text-ink"
      />
    </div>
  )
}
