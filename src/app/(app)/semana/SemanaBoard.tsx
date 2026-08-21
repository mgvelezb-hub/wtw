'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { AyudaContextual } from '@/components/ayuda-contextual'
import type { ResultadoSobrecarga } from '@/lib/carga-sostenible'
import { toggleWinAction } from './actions'

type Win = { id: string; posicion: number; titulo: string; dod: string | null; siEntonces: string | null; estatus: string }
type Block = { id: string; fecha: Date; inicio: string; fin: string; tipo: string; titulo: string; planMin: number }

// Calm tech: en verde no se muestra nada. En ámbar/rojo, un chip junto a la
// barra de capacidad con las señales activas y la única recomendación
// accionable.
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

export function SemanaBoard({
  wins,
  blocks,
  cargaHoras,
  trabajableTotal,
  trabajablePlaneable,
  sobrecarga,
}: {
  wins: Win[]
  blocks: Block[]
  cargaHoras: number
  trabajableTotal: number
  trabajablePlaneable: number
  sobrecarga: ResultadoSobrecarga
}) {
  const [pending, startTransition] = useTransition()

  const porDia = blocks.reduce<Record<string, Block[]>>((acc, b) => {
    const key = new Date(b.fecha).toISOString().slice(0, 10)
    ;(acc[key] ??= []).push(b)
    return acc
  }, {})

  const pct = trabajableTotal > 0 ? Math.min(100, (cargaHoras / trabajableTotal) * 100) : 0

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase text-neutral-500">
            Wins de la semana
            <AyudaContextual
              titulo="Wins de la semana"
              ejemplo="Ej. «Si el cliente mueve la junta del martes, entonces mando el avance por correo ese mismo día»."
            >
              Los 3 resultados que definen la semana: si se cumplen, la semana se ganó, aunque no todo lo demás haya
              salido. Debajo de cada uno aparece su <strong>si-entonces</strong> —el plan que escribiste para el
              obstáculo que ya sabes que viene—, y está aquí para repasarlo antes de que aparezca, no después. El ✓ marca
              el Win como logrado.
            </AyudaContextual>
          </h2>
          {/* Siempre visible: antes el acceso al planeador solo existía en el
              estado vacío de /semana, y Mi Día crea la semana como cascarón en
              cuanto arrastras una tarea o sincronizas juntas. Resultado: la
              semana existía, el botón desaparecía, y no había forma de definir
              los Wins ni de llegar al ritual. */}
          <Link
            href="/semana/nueva"
            className="rounded-full border border-brand-deep px-3 py-1 text-xs font-bold text-brand-deep hover:bg-brand-deep/10"
          >
            {wins.length === 0 ? 'Planear la semana' : 'Abrir el planeador'}
          </Link>
        </div>
        {wins.length === 0 && (
          <div className="mb-2 rounded-lg border border-warn-border bg-warn-soft p-3">
            <p className="text-sm font-semibold text-warn">Esta semana no tiene Wins definidos</p>
            <p className="mt-1 text-xs text-warn">
              Sin Wins, las actividades no se pueden priorizar contra un resultado. El planeador te lleva por los 5 pasos del
              ritual: reflejar, definir Wins, vaciar y dimensionar, bloquear y pre-emptar.
            </p>
            <Link
              href="/semana/nueva"
              className="mt-2 inline-block rounded-full bg-brand-deep px-4 py-2 text-sm font-bold text-white"
            >
              Planear la semana →
            </Link>
          </div>
        )}
        <div className="space-y-2">
          {wins.map((w) => (
            <div key={w.id} className="flex items-start justify-between gap-2 rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
              <div className="min-w-0">
                <p className={`font-medium ${w.estatus === 'logrado' ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>
                  {w.posicion}. {w.titulo}
                </p>
                {w.dod && <p className="text-xs text-neutral-500">DoD: {w.dod}</p>}
                {/* El si-entonces se REPASA aquí, no solo se escribió una vez en
                    el planeador: el plan sirve cuando ya está en la cabeza antes
                    de que aparezca el obstáculo, y esta es la pantalla que Mau
                    abre durante la semana. Se oculta en los Wins ya logrados —
                    el plan de implementación de algo cumplido es ruido. */}
                {w.siEntonces && w.estatus !== 'logrado' && (
                  <p className="mt-1 rounded border border-brand/30 bg-brand/5 px-2 py-1 text-xs text-brand-deep">
                    {w.siEntonces}
                  </p>
                )}
              </div>
              <button
                disabled={pending}
                onClick={() => startTransition(() => void toggleWinAction(w.id))}
                className="shrink-0 rounded-md bg-neutral-100 px-3 py-1.5 text-sm font-medium hover:bg-neutral-200"
              >
                {w.estatus === 'logrado' ? '↺' : '✓'}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-neutral-500">
          Capacidad
          <AyudaContextual titulo="Carga contra lo planeable">
            <strong>Carga</strong> es la suma de lo que ya está comprometido esta semana.{' '}
            <strong>Planeable</strong> son las horas que quedan libres después de las juntas, menos el colchón que
            reservas a propósito para lo que no se puede prever. Si la barra se pone roja, comprometiste más de lo que
            cabe: la respuesta es mover o soltar trabajo, no exprimir el colchón.
          </AyudaContextual>
        </h2>
        {sobrecarga.nivel !== 'verde' && (
          <div className="mb-2">
            <ChipSobrecarga sobrecarga={sobrecarga} />
          </div>
        )}
        <div className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
          <div className="flex justify-between text-sm text-neutral-700">
            <span>Carga: {cargaHoras.toFixed(1)}h</span>
            <span>Planeable: {trabajablePlaneable.toFixed(1)}h</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className={`h-full ${cargaHoras > trabajablePlaneable ? 'bg-danger' : 'bg-brand'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase text-neutral-500">Bloques por día</h2>
        <div className="space-y-3">
          {Object.entries(porDia).map(([fecha, dayBlocks]) => (
            <div key={fecha}>
              <p className="mb-1 text-xs font-semibold text-neutral-600">{fecha}</p>
              <div className="space-y-1">
                {dayBlocks.map((b) => (
                  <div key={b.id} className="flex justify-between rounded-md bg-white px-3 py-1.5 text-sm shadow-sm">
                    <span className="text-neutral-500">
                      {b.inicio}–{b.fin}
                    </span>
                    <span className="text-neutral-900">{b.titulo}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
