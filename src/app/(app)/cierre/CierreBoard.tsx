'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import type { DesvioCausa } from '@prisma/client'
import type { CierreDia, PatronDesvios } from './service'
import { CAUSAS, CAUSA_LABEL, CAUSA_QUE_SIGNIFICA } from './service'
import { AyudaContextual } from '@/components/ayuda-contextual'
import { TourPrimeraVez } from '@/components/tour-primera-vez'
import {
  guardarCierreAction,
  borrarCierreAction,
  pasarPendientesAction,
  convertirDesvioEnTareaAction,
  type DesvioInput,
} from './actions'

type Fila = DesvioInput & { key: string }

const A_QUIEN_TOCA_COLOR: Record<string, string> = {
  cliente: 'bg-warn-border text-warn',
  disciplina: 'bg-[#5b4b8a] text-white',
  código: 'bg-brand text-white',
}

function horas(min: number): string {
  if (min <= 0) return '0h'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function conStakeholder(causa: DesvioCausa): boolean {
  return causa === 'bomberazo' || causa === 'cambio_prioridad_cliente'
}

export function CierreBoard({
  cierre,
  patron,
  diaAnterior,
  diaSiguiente,
}: {
  cierre: CierreDia
  patron: PatronDesvios
  diaAnterior: string
  diaSiguiente: string
}): React.ReactElement {
  const [filas, setFilas] = useState<Fila[]>(() =>
    cierre.desvios.length > 0
      ? cierre.desvios.map((d, i) => ({
          key: `g${i}`,
          causa: d.causa,
          minutos: d.minutos,
          stakeholderId: d.stakeholderId ?? undefined,
          taskId: d.taskId ?? undefined,
          nota: d.nota ?? undefined,
        }))
      : cierre.sugerencia
        ? [
            {
              key: 's0',
              causa: cierre.sugerencia.causa,
              minutos: cierre.sugerencia.minutos,
              taskId: cierre.sugerencia.taskId ?? undefined,
            },
          ]
        : []
  )
  const [nota, setNota] = useState(cierre.nota ?? '')
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)
  const [pending, startTransition] = useTransition()
  // Qué fila tiene abierto el formulario de "registrar como trabajo", y cuáles ya
  // se registraron (key → título de la tarea creada). Vive local porque el desvío
  // puede no estar guardado todavía: obligar a guardar antes de poder registrar el
  // trabajo sería justo la fricción que hace que el trabajo aliado nunca se cargue.
  const [promoviendo, setPromoviendo] = useState<string | null>(null)
  const [promovidas, setPromovidas] = useState<Record<string, string>>({})
  const [movidos, setMovidos] = useState<{ movidos: number; hacia: string } | null>(null)

  function set(key: string, cambio: Partial<Fila>): void {
    setFilas((f) => f.map((x) => (x.key === key ? { ...x, ...cambio } : x)))
    setGuardado(false)
  }

  function accion(fn: () => Promise<void>): void {
    setError(null)
    startTransition(async () => {
      try {
        await fn()
        setGuardado(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo guardar el cierre.')
      }
    })
  }

  const explicado = filas.reduce((s, f) => s + (f.minutos || 0), 0)
  const faltaPorExplicar = Math.max(0, cierre.huecoMin - explicado)

  return (
    <div className="space-y-5">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-ink">Cierre del día</h1>
          <TourPrimeraVez
            ruta="/cierre"
            bullets={[
              'Son 60 segundos al final del día, no un reporte. Confirmas qué se hizo, qué no, y a dónde se fue el tiempo que el cronómetro no alcanzó a registrar.',
              <>
                No reemplaza al cronómetro: lo <strong>audita</strong>. Lo que de verdad captura es <em>por qué</em> se
                rompió el plan — esa mitad de la información no existe en ninguna otra pantalla.
              </>,
              'Lo que quedó sin terminar se pasa desde aquí al siguiente día hábil, con un clic y sin volver a escribirlo.',
            ]}
          />
          <nav className="ml-auto flex items-center gap-1 text-xs">
            <Link href={`/cierre?dia=${diaAnterior}`} className="rounded border border-hair px-2 py-1 text-muted">
              ←
            </Link>
            <span className="num text-muted">{cierre.fecha}</span>
            <Link href={`/cierre?dia=${diaSiguiente}`} className="rounded border border-hair px-2 py-1 text-muted">
              →
            </Link>
          </nav>
        </div>
        <p className="mt-1 text-sm text-muted">
          60 segundos. Esto <strong>no reemplaza al cronómetro</strong>: lo audita. Lo que captura es <em>por qué</em> se
          rompió el plan, que es la mitad de la información y hoy se pierde completa.
        </p>
      </header>

      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      <section className="hair pt-4">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span className="text-muted">
            Planeado <strong className="num text-ink">{horas(cierre.planMin)}</strong>
          </span>
          <span className="text-muted">
            Cronometrado <strong className="num text-ink">{horas(cierre.medidoMin)}</strong>
          </span>
          <span className="text-muted">
            {/* "Sin explicar" es el dato, no un veredicto: por eso el color solo
                marca si falta registrar algo (danger) o si ya quedó completo
                (ok) — nunca "qué tan mal te fue". */}
            Sin explicar{' '}
            <strong className={`num ${faltaPorExplicar > 0 ? 'text-danger' : 'text-ok'}`}>{horas(faltaPorExplicar)}</strong>
          </span>
        </div>

        {cierre.planMin === 0 ? (
          // Antes decía "no hay nada que reconciliar", que es lo contrario de la
          // verdad: el día que el plan no existió o se rompió entero es cuando más
          // importa registrar a dónde se fue el tiempo.
          <p className="mt-2 text-xs text-muted">
            No había nada planeado este día — o los pendientes ya se pasaron. Registra abajo en qué se fue el tiempo: es el
            único momento en que ese dato existe.
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted">
            {cierre.huecoMin === 0
              ? 'El cronómetro cubre todo lo planeado. Guarda el día así: un cierre sin desvíos significa que el plan se cumplió.'
              : `${horas(cierre.huecoMin)} planeados no aparecen en ningún cronómetro. Regístralo abajo — no es una confesión, es el dato que calibra el plan de mañana.`}
          </p>
        )}

        {cierre.desdeSnapshot && (
          <p className="mt-2 text-[11px] text-faint">
            Estas cifras vienen del snapshot tomado al pasar los pendientes, no de los bloques vivos — por eso siguen
            siendo fieles a lo que había planeado ese día.
          </p>
        )}

        {cierre.tareas.some((t) => t.hechaSinMedir) && (
          <p className="mt-2 rounded bg-warn-soft px-2 py-1 text-xs text-warn">
            Terminaste sin cronometrar:{' '}
            {cierre.tareas
              .filter((t) => t.hechaSinMedir)
              .map((t) => t.titulo)
              .join(' · ')}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="lbl">Qué pasó de verdad</h2>
          <button
            onClick={() => {
              setFilas((f) => [...f, { key: `n${f.length}${Date.now()}`, causa: 'bomberazo', minutos: 30 }])
              setGuardado(false)
            }}
            className="rounded-md border border-hair bg-surface px-3 py-1 text-xs font-bold text-brand-deep hover:bg-brand-soft"
          >
            + Desvío
          </button>
        </div>

        {filas.length === 0 && (
          <p className="text-xs text-faint">
            Sin desvíos. Guardar así declara que el día salió como estaba planeado — que es un dato, no un formulario vacío.
          </p>
        )}

        {filas.map((f) => (
          <div key={f.key} className="space-y-1 rounded-lg border border-hair bg-surface p-2">
            <div className="flex flex-wrap items-center gap-1">
              <select
                value={f.causa}
                aria-label="Causa del desvío"
                onChange={(e) => set(f.key, { causa: e.target.value as DesvioCausa })}
                className="min-w-48 flex-1 rounded border border-hair bg-surface px-1 py-1 text-sm text-ink"
              >
                {CAUSAS.map((c) => (
                  <option key={c} value={c}>
                    {CAUSA_LABEL[c]}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                step={15}
                value={f.minutos || ''}
                aria-label="Minutos del desvío"
                onChange={(e) => set(f.key, { minutos: Math.max(0, Number(e.target.value) || 0) })}
                className="num w-20 rounded border border-hair px-1 py-1 text-sm text-ink"
              />
              <span className="text-xs text-faint">min</span>
              <button
                onClick={() => {
                  setFilas((x) => x.filter((y) => y.key !== f.key))
                  setGuardado(false)
                }}
                aria-label="Quitar desvío"
                className="ml-auto text-xs text-faint underline"
              >
                quitar
              </button>
            </div>

            <p className="text-[11px] leading-tight text-muted">{CAUSA_QUE_SIGNIFICA[f.causa]}</p>

            <div className="flex flex-wrap gap-1">
              {conStakeholder(f.causa) && cierre.stakeholders.length > 0 && (
                <select
                  value={f.stakeholderId ?? ''}
                  aria-label="De quién vino la urgencia"
                  onChange={(e) => set(f.key, { stakeholderId: e.target.value || undefined })}
                  className="rounded border border-hair bg-surface px-1 py-0.5 text-xs text-muted"
                >
                  <option value="">¿De quién vino?</option>
                  {cierre.stakeholders.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              )}
              {cierre.tareas.length > 0 && (
                <select
                  value={f.taskId ?? ''}
                  aria-label="Tarea afectada"
                  onChange={(e) => set(f.key, { taskId: e.target.value || undefined })}
                  className="rounded border border-hair bg-surface px-1 py-0.5 text-xs text-muted"
                >
                  <option value="">Sin tarea específica</option>
                  {cierre.tareas.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.titulo}
                    </option>
                  ))}
                </select>
              )}
              <input
                value={f.nota ?? ''}
                aria-label="Nota del desvío"
                onChange={(e) => set(f.key, { nota: e.target.value })}
                placeholder="Nota (opcional)"
                className="min-w-32 flex-1 rounded border border-hair px-2 py-0.5 text-xs text-ink"
              />
            </div>

            {/* Sin esto, el trabajo no planeado moría como texto libre en la nota:
                alimentaba el patrón de causas pero nunca llegaba al ledger Aliado
                ni generaba evidencia de competencias. */}
            {promovidas[f.key] ? (
              <p className="rounded bg-ok-soft px-2 py-1 text-xs text-ok">
                ✓ Registrado como trabajo hecho: <strong>{promovidas[f.key]}</strong>
              </p>
            ) : promoviendo === f.key ? (
              <PromoverDesvio
                minutos={f.minutos}
                notaSugerida={f.nota ?? ''}
                proyectos={cierre.proyectos}
                pending={pending}
                onCancelar={() => setPromoviendo(null)}
                onRegistrar={(datos) =>
                  accion(async () => {
                    await convertirDesvioEnTareaAction({ ...datos, minutos: f.minutos, fecha: cierre.fecha })
                    setPromovidas((p) => ({ ...p, [f.key]: datos.titulo }))
                    setPromoviendo(null)
                  })
                }
              />
            ) : (
              f.minutos > 0 &&
              cierre.proyectos.length > 0 && (
                <button
                  onClick={() => setPromoviendo(f.key)}
                  className="text-xs text-brand-deep underline"
                >
                  Registrar estos {f.minutos} min como trabajo hecho
                </button>
              )
            )}
          </div>
        ))}

        <input
          value={nota}
          onChange={(e) => {
            setNota(e.target.value)
            setGuardado(false)
          }}
          placeholder="Nota del día (opcional)"
          aria-label="Nota del día"
          className="w-full rounded border border-hair px-2 py-1 text-sm text-ink"
        />

        <div className="flex items-center gap-2">
          <button
            disabled={pending}
            onClick={() =>
              accion(() =>
                guardarCierreAction({
                  fecha: cierre.fecha,
                  nota: nota || undefined,
                  desvios: filas.map((f) => ({
                    causa: f.causa,
                    minutos: f.minutos,
                    stakeholderId: conStakeholder(f.causa) ? f.stakeholderId : undefined,
                    taskId: f.taskId,
                    nota: f.nota,
                  })),
                })
              )
            }
            className="rounded-md bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {pending ? 'Guardando…' : cierre.yaReconciliado ? 'Actualizar cierre' : 'Cerrar el día'}
          </button>
          {guardado && <span className="text-xs font-bold text-ok">✓ guardado</span>}
          {cierre.yaReconciliado && (
            <button
              disabled={pending}
              onClick={() => accion(() => borrarCierreAction(cierre.fecha))}
              className="ml-auto text-xs text-faint underline"
            >
              deshacer cierre
            </button>
          )}
        </div>
      </section>

      {/* Mover es el ÚLTIMO paso, y por eso vive después de registrar los desvíos:
          hacerlo antes le cambia la fecha a los bloques y borra la evidencia de lo
          que se había planeado. */}
      {(cierre.pendientesPorMover > 0 || cierre.yaMovidos) && (
        <section className="hair pt-4">
          <h2 className="lbl">Pendientes sin terminar</h2>
          {movidos ?? cierre.yaMovidos ? (
            <p className="mt-1 text-sm text-ink">
              {movidos
                ? `${movidos.movidos} ${movidos.movidos === 1 ? 'pendiente movido' : 'pendientes movidos'} a ${movidos.hacia}.`
                : `${cierre.yaMovidos!.cuantos} ${
                    cierre.yaMovidos!.cuantos === 1 ? 'pendiente movido' : 'pendientes movidos'
                  } a ${cierre.yaMovidos!.hacia}.`}
              {cierre.pendientesPorMover > 0 && ` Quedan ${cierre.pendientesPorMover} en este día.`}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted">
              {cierre.pendientesPorMover} sin terminar. Se pasan al siguiente día hábil, y las cifras de arriba quedan
              congeladas para que este día siga siendo legible después.
            </p>
          )}

          {cierre.pendientesPorMover > 0 && (
            <button
              disabled={pending}
              onClick={() =>
                accion(async () => {
                  setMovidos(await pasarPendientesAction(cierre.fecha))
                })
              }
              className="mt-2 rounded-md border border-hair bg-surface px-3 py-1 text-xs font-bold text-brand-deep hover:bg-brand-soft disabled:opacity-40"
            >
              {pending ? 'Moviendo…' : `Pasar ${cierre.pendientesPorMover} al siguiente día hábil`}
            </button>
          )}
        </section>
      )}

      <section className="hair pt-4">
        <h2 className="lbl flex items-center gap-1.5">
          Qué causa domina — últimos 14 días
          <AyudaContextual
            titulo="La compuerta de 14 días"
            ejemplo="Ej. si domina «Cambio de prioridad del cliente», el problema no es cómo estimas: es cómo se está acordando el alcance."
          >
            Cada desvío que registras arriba se acumula en una ventana de 14 días. No es un marcador: es la única salida
            de la compuerta. Como cada causa tiene un dueño distinto —el cliente, el código o tu disciplina—, la que
            domina decide en qué trabajar después. Con pocos días cerrados no hay muestra que leer, así que la primera
            lectura útil llega a las dos semanas de cerrar el día.
          </AyudaContextual>
        </h2>
        <p className="mt-1 text-xs text-muted">
          La compuerta no evalúa si el factor de realismo sobrevive: sobrevive, es el objetivo. Evalúa qué causa domina,
          porque cada una lleva a un trabajo distinto.
        </p>

        {patron.dominante === null ? (
          <p className="mt-2 text-sm text-faint">
            {patron.diasReconciliados === 0
              ? 'Ningún día reconciliado todavía. Este panel es la única salida de la compuerta — sin días cerrados no hay nada que leer.'
              : `${patron.diasReconciliados} día${patron.diasReconciliados > 1 ? 's' : ''} cerrado${
                  patron.diasReconciliados > 1 ? 's' : ''
                } sin desvíos: el plan se está cumpliendo.`}
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-ink">
              Domina <strong className="text-brand-deep">{CAUSA_LABEL[patron.dominante]}</strong> sobre{' '}
              {horas(patron.totalMin)} en {patron.diasReconciliados} día{patron.diasReconciliados > 1 ? 's' : ''}{' '}
              reconciliado{patron.diasReconciliados > 1 ? 's' : ''}.
            </p>
            <ul className="mt-2 space-y-1">
              {patron.porCausa
                .filter((c) => c.minutos > 0)
                .map((c) => (
                  <li key={c.causa} className="flex items-center gap-2 text-xs">
                    <span className="w-52 shrink-0 truncate text-ink">{c.label}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded bg-hair">
                      <span className="block h-full bg-brand" style={{ width: `${c.pct}%` }} />
                    </span>
                    <span className="num w-16 shrink-0 text-right text-muted">{horas(c.minutos)}</span>
                    <span className={`shrink-0 rounded px-1 text-[10px] font-bold uppercase ${A_QUIEN_TOCA_COLOR[c.aQuienToca]}`}>
                      {c.aQuienToca}
                    </span>
                  </li>
                ))}
            </ul>

            {patron.origenUrgencias.length > 0 && (
              <div className="mt-3 border-t border-hair pt-2">
                <p className="text-xs font-bold text-brand-deep">De dónde vienen las urgencias</p>
                <ul className="mt-1 space-y-0.5">
                  {patron.origenUrgencias.map((o) => (
                    <li key={o.nombre} className="text-xs text-muted">
                      {o.nombre} — <strong className="num">{horas(o.minutos)}</strong>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[11px] text-faint">
                  Esto es evidencia para renegociar alcance, no percepción.
                </p>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}

// Formulario mínimo para convertir un desvío en trabajo registrado. Los minutos no
// se piden: ya están en el desvío, y volver a teclearlos invita a que los dos
// números divergan.
function PromoverDesvio({
  minutos,
  notaSugerida,
  proyectos,
  pending,
  onCancelar,
  onRegistrar,
}: {
  minutos: number
  notaSugerida: string
  proyectos: Array<{ id: string; nombre: string; tieneTarifa: boolean }>
  pending: boolean
  onCancelar: () => void
  onRegistrar: (datos: { titulo: string; projectId: string; alcance: 'aliado' | 'sow'; dolorCliente?: string }) => void
}): React.ReactElement {
  const [titulo, setTitulo] = useState(notaSugerida)
  const [projectId, setProjectId] = useState(proyectos[0]?.id ?? '')
  const [alcance, setAlcance] = useState<'aliado' | 'sow'>('aliado')
  const [dolor, setDolor] = useState('')

  const proyecto = proyectos.find((p) => p.id === projectId)
  // El dolor es obligatorio en aliado: sin él el ledger acumula horas que no se
  // pueden defender en una negociación, que es su única razón de existir.
  const listo = titulo.trim() !== '' && projectId !== '' && (alcance === 'sow' || dolor.trim() !== '')

  return (
    <div className="space-y-1 rounded-lg border border-brand-deep/30 bg-brand-deep/5 p-2">
      <p className="text-xs font-bold text-brand-deep">Registrar {minutos} min como trabajo hecho</p>
      <input
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="Qué hiciste, como se escribiría una tarea"
        aria-label="Título del trabajo"
        className="w-full rounded border border-hair bg-surface px-2 py-0.5 text-xs text-ink"
      />
      <div className="flex flex-wrap items-center gap-1">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          aria-label="Proyecto del trabajo"
          className="rounded border border-hair bg-surface px-1 py-0.5 text-xs text-muted"
        >
          {proyectos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <select
          value={alcance}
          onChange={(e) => setAlcance(e.target.value as 'aliado' | 'sow')}
          aria-label="Alcance del trabajo"
          className="rounded border border-hair bg-surface px-1 py-0.5 text-xs text-muted"
        >
          <option value="aliado">Fuera del SOW (aliado)</option>
          <option value="sow">Dentro del SOW</option>
        </select>
      </div>
      {alcance === 'aliado' && (
        <>
          <input
            value={dolor}
            onChange={(e) => setDolor(e.target.value)}
            placeholder="Qué dolor del cliente atendió (requerido)"
            aria-label="Dolor del cliente"
            className="w-full rounded border border-hair bg-surface px-2 py-0.5 text-xs text-ink"
          />
          {proyecto && !proyecto.tieneTarifa && (
            <p className="text-[11px] text-danger">
              {proyecto.nombre} no tiene tarifa por hora: estas horas se van a contar, pero no se pueden valorizar en pesos.
            </p>
          )}
        </>
      )}
      <div className="flex items-center gap-2">
        <button
          disabled={pending || !listo}
          onClick={() =>
            onRegistrar({
              titulo,
              projectId,
              alcance,
              dolorCliente: alcance === 'aliado' ? dolor : undefined,
            })
          }
          className="rounded-md bg-brand px-3 py-1 text-xs font-bold text-white disabled:opacity-40"
        >
          {pending ? 'Registrando…' : 'Registrar'}
        </button>
        <button onClick={onCancelar} className="text-xs text-muted underline">
          cancelar
        </button>
      </div>
    </div>
  )
}
