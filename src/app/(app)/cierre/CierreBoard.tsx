'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import type { DesvioCausa } from '@prisma/client'
import type { CierreDia, PatronDesvios } from './service'
import { CAUSAS, CAUSA_LABEL, CAUSA_QUE_SIGNIFICA } from './service'
import { guardarCierreAction, borrarCierreAction, type DesvioInput } from './actions'

type Fila = DesvioInput & { key: string }

const A_QUIEN_TOCA_COLOR: Record<string, string> = {
  cliente: 'bg-[#e8b94a] text-[#4a3a10]',
  disciplina: 'bg-[#5b4b8a] text-white',
  código: 'bg-[#0d6d63] text-white',
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
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold text-neutral-900">Cierre del día</h1>
          <nav className="flex items-center gap-1 text-xs">
            <Link href={`/cierre?dia=${diaAnterior}`} className="rounded border border-neutral-300 px-2 py-1 text-neutral-600">
              ←
            </Link>
            <span className="font-mono text-neutral-500">{cierre.fecha}</span>
            <Link href={`/cierre?dia=${diaSiguiente}`} className="rounded border border-neutral-300 px-2 py-1 text-neutral-600">
              →
            </Link>
          </nav>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          60 segundos. Esto <strong>no reemplaza al cronómetro</strong>: lo audita. Lo que captura es <em>por qué</em> se
          rompió el plan, que es la mitad de la información y hoy se pierde completa.
        </p>
      </header>

      {error && <p className="rounded-lg bg-[#f7dcdc] px-3 py-2 text-sm text-[#b43232]">{error}</p>}

      <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span className="text-neutral-500">
            Planeado <strong className="text-neutral-900">{horas(cierre.planMin)}</strong>
          </span>
          <span className="text-neutral-500">
            Cronometrado <strong className="text-neutral-900">{horas(cierre.medidoMin)}</strong>
          </span>
          <span className="text-neutral-500">
            Sin explicar{' '}
            <strong className={faltaPorExplicar > 0 ? 'text-[#b43232]' : 'text-[#0d6d63]'}>{horas(faltaPorExplicar)}</strong>
          </span>
        </div>

        {cierre.planMin === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">No había nada planeado este día. No hay nada que reconciliar.</p>
        ) : (
          <p className="mt-2 text-xs text-neutral-500">
            {cierre.huecoMin === 0
              ? 'El cronómetro cubre todo lo planeado. Guarda el día así: un cierre sin desvíos significa que el plan se cumplió.'
              : `${horas(cierre.huecoMin)} planeados no aparecen en ningún cronómetro. Explica a dónde se fueron.`}
          </p>
        )}

        {cierre.tareas.some((t) => t.hechaSinMedir) && (
          <p className="mt-2 rounded bg-[#f5deae] px-2 py-1 text-xs text-[#4a3a10]">
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
          <h2 className="text-xs font-bold uppercase tracking-wide text-[#0c4a45]">Qué pasó de verdad</h2>
          <button
            onClick={() => {
              setFilas((f) => [...f, { key: `n${f.length}${Date.now()}`, causa: 'bomberazo', minutos: 30 }])
              setGuardado(false)
            }}
            className="rounded-full border border-[#0c4a45] px-3 py-1 text-xs font-bold text-[#0c4a45] hover:bg-[#0c4a45]/10"
          >
            + Desvío
          </button>
        </div>

        {filas.length === 0 && (
          <p className="text-xs text-neutral-400">
            Sin desvíos. Guardar así declara que el día salió como estaba planeado — que es un dato, no un formulario vacío.
          </p>
        )}

        {filas.map((f) => (
          <div key={f.key} className="space-y-1 rounded-lg border border-neutral-200 bg-white p-2">
            <div className="flex flex-wrap items-center gap-1">
              <select
                value={f.causa}
                aria-label="Causa del desvío"
                onChange={(e) => set(f.key, { causa: e.target.value as DesvioCausa })}
                className="min-w-48 flex-1 rounded border border-neutral-300 bg-white px-1 py-1 text-sm text-neutral-900"
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
                className="w-20 rounded border border-neutral-300 px-1 py-1 text-sm text-neutral-900"
              />
              <span className="text-xs text-neutral-400">min</span>
              <button
                onClick={() => {
                  setFilas((x) => x.filter((y) => y.key !== f.key))
                  setGuardado(false)
                }}
                aria-label="Quitar desvío"
                className="ml-auto text-xs text-neutral-400 underline"
              >
                quitar
              </button>
            </div>

            <p className="text-[11px] leading-tight text-neutral-500">{CAUSA_QUE_SIGNIFICA[f.causa]}</p>

            <div className="flex flex-wrap gap-1">
              {conStakeholder(f.causa) && cierre.stakeholders.length > 0 && (
                <select
                  value={f.stakeholderId ?? ''}
                  aria-label="De quién vino la urgencia"
                  onChange={(e) => set(f.key, { stakeholderId: e.target.value || undefined })}
                  className="rounded border border-neutral-300 bg-white px-1 py-0.5 text-xs text-neutral-600"
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
                  className="rounded border border-neutral-300 bg-white px-1 py-0.5 text-xs text-neutral-600"
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
                className="min-w-32 flex-1 rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-900"
              />
            </div>
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
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900"
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
            className="rounded-full bg-[#0c4a45] px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {pending ? 'Guardando…' : cierre.yaReconciliado ? 'Actualizar cierre' : 'Cerrar el día'}
          </button>
          {guardado && <span className="text-xs font-bold text-[#0d6d63]">✓ guardado</span>}
          {cierre.yaReconciliado && (
            <button
              disabled={pending}
              onClick={() => accion(() => borrarCierreAction(cierre.fecha))}
              className="ml-auto text-xs text-neutral-400 underline"
            >
              deshacer cierre
            </button>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-wide text-[#0c4a45]">Qué causa domina — últimos 14 días</h2>
        <p className="mt-1 text-xs text-neutral-500">
          La compuerta no evalúa si el factor de realismo sobrevive: sobrevive, es el objetivo. Evalúa qué causa domina,
          porque cada una lleva a un trabajo distinto.
        </p>

        {patron.dominante === null ? (
          <p className="mt-2 text-sm text-neutral-400">
            {patron.diasReconciliados === 0
              ? 'Ningún día reconciliado todavía. Este panel es la única salida de la compuerta — sin días cerrados no hay nada que leer.'
              : `${patron.diasReconciliados} día${patron.diasReconciliados > 1 ? 's' : ''} cerrado${
                  patron.diasReconciliados > 1 ? 's' : ''
                } sin desvíos: el plan se está cumpliendo.`}
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-neutral-700">
              Domina <strong className="text-[#0c4a45]">{CAUSA_LABEL[patron.dominante]}</strong> sobre{' '}
              {horas(patron.totalMin)} en {patron.diasReconciliados} día{patron.diasReconciliados > 1 ? 's' : ''}{' '}
              reconciliado{patron.diasReconciliados > 1 ? 's' : ''}.
            </p>
            <ul className="mt-2 space-y-1">
              {patron.porCausa
                .filter((c) => c.minutos > 0)
                .map((c) => (
                  <li key={c.causa} className="flex items-center gap-2 text-xs">
                    <span className="w-52 shrink-0 truncate text-neutral-700">{c.label}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded bg-neutral-100">
                      <span className="block h-full bg-[#0d6d63]" style={{ width: `${c.pct}%` }} />
                    </span>
                    <span className="w-16 shrink-0 text-right text-neutral-500">{horas(c.minutos)}</span>
                    <span className={`shrink-0 rounded px-1 text-[10px] font-bold uppercase ${A_QUIEN_TOCA_COLOR[c.aQuienToca]}`}>
                      {c.aQuienToca}
                    </span>
                  </li>
                ))}
            </ul>

            {patron.origenUrgencias.length > 0 && (
              <div className="mt-3 border-t border-neutral-100 pt-2">
                <p className="text-xs font-bold text-[#0c4a45]">De dónde vienen las urgencias</p>
                <ul className="mt-1 space-y-0.5">
                  {patron.origenUrgencias.map((o) => (
                    <li key={o.nombre} className="text-xs text-neutral-600">
                      {o.nombre} — <strong>{horas(o.minutos)}</strong>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[11px] text-neutral-400">
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
