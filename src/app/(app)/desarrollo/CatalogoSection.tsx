'use client'

import { useState, useTransition } from 'react'
import type { CatalogoDesarrollo, RecursoView } from './service'
import { marcarRecursoAction, practicarRecursoAction } from './actions'

const ICONO: Record<string, string> = {
  libro: '📕',
  curso: '🎓',
  platica: '🎤',
  articulo: '📄',
  ejercicio: '🔁',
}

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: 'pendiente',
  en_curso: 'en curso',
  hecho: 'hecho',
  descartado: 'descartado',
}

// Un estado, un color, y solo cuando el estado significa algo: "hecho" confirma
// (ok), "en curso" es marca, y pendiente/descartado son texto gris. El ámbar
// queda reservado para advertencias reales, aquí no hay ninguna.
const ESTILO_ESTADO: Record<string, string> = {
  pendiente: 'text-faint',
  en_curso: 'text-brand',
  hecho: 'text-ok',
  descartado: 'text-faint',
}

const BTN_MINI =
  'rounded-md border border-hair px-2 py-0.5 text-[11px] font-semibold text-muted transition-colors hover:border-brand hover:text-brand disabled:opacity-40'

// Sección colapsable del pie — misma pieza que en DesarrolloBoard.tsx. Se
// duplica en vez de importarse entre archivos hermanos para no crear un
// acoplamiento nuevo entre los dos componentes de la página; visualmente es la
// última fila de la misma lista de hairlines.
function Seccion({
  titulo,
  resumen,
  contador,
  defaultAbierto,
  children,
}: {
  titulo: string
  resumen?: React.ReactNode
  contador?: number
  defaultAbierto: boolean
  children: React.ReactNode
}): React.ReactElement {
  const [abierto, setAbierto] = useState(defaultAbierto)

  return (
    <section className="border-b border-hair">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center justify-between gap-3 py-3 text-left text-[13px] text-muted transition-colors hover:text-ink"
      >
        <span className="min-w-0">
          <span className="font-medium text-ink">{titulo}</span>
          {resumen && <span className="text-muted"> — {resumen}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {contador !== undefined && <span className="num text-xs text-muted">{contador}</span>}
          <span className={`text-faint transition-transform ${abierto ? 'rotate-90' : ''}`} aria-hidden>
            ▸
          </span>
        </span>
      </button>
      {abierto && <div className="space-y-6 pb-5">{children}</div>}
    </section>
  )
}

function Recurso({
  r,
  pending,
  onEstado,
  onPracticar,
}: {
  r: RecursoView
  pending: boolean
  onEstado: (estado: 'pendiente' | 'en_curso' | 'hecho' | 'descartado') => void
  onPracticar: () => void
}): React.ReactElement {
  const [abierto, setAbierto] = useState(false)
  const esPractica = r.tipo === 'ejercicio' && r.cadencia !== null && r.cadencia !== 'una vez'

  return (
    <li className={`border-t border-hair py-2 first:border-t-0 ${r.estado === 'descartado' ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-2">
        <span className="shrink-0" aria-hidden>
          {ICONO[r.tipo] ?? '•'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">
            {r.url ? (
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="underline decoration-hair underline-offset-2">
                {r.titulo}
              </a>
            ) : (
              r.titulo
            )}
            {r.fuente && <span className="ml-1 text-xs font-normal text-muted">— {r.fuente}</span>}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wide text-faint">
            <span className={`font-semibold ${ESTILO_ESTADO[r.estado] ?? 'text-faint'}`}>{ETIQUETA_ESTADO[r.estado]}</span>
            {r.cadencia && <span>· {r.cadencia}</span>}
            {r.duracionMin !== null && (
              <span>
                · <span className="num">{r.duracionMin}</span> min
              </span>
            )}
            {esPractica && r.veces > 0 && (
              <span className="num font-semibold text-brand-deep">· {r.veces}× practicado</span>
            )}
          </p>
          <button
            onClick={() => setAbierto(!abierto)}
            className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-brand-deep hover:underline"
          >
            {abierto ? 'ocultar' : 'por qué sirve'}
          </button>
          {abierto && <p className="mt-1 text-xs text-muted">{r.porQue}</p>}
        </div>

        <div className="flex shrink-0 flex-col gap-1">
          {esPractica ? (
            <button
              disabled={pending}
              onClick={onPracticar}
              className="rounded-md bg-brand-deep px-2 py-1 text-[11px] font-semibold text-surface transition-colors hover:bg-brand-strong disabled:opacity-40"
              title="Registrar una práctica más"
            >
              +1 practicado
            </button>
          ) : (
            <>
              {r.estado !== 'en_curso' && r.estado !== 'hecho' && (
                <button disabled={pending} onClick={() => onEstado('en_curso')} className={BTN_MINI}>
                  empezar
                </button>
              )}
              {r.estado !== 'hecho' && (
                <button
                  disabled={pending}
                  onClick={() => onEstado('hecho')}
                  className={`${BTN_MINI} border-ok/50 text-ok hover:border-ok hover:text-ok`}
                >
                  hecho
                </button>
              )}
              {r.estado === 'pendiente' && (
                <button
                  disabled={pending}
                  onClick={() => onEstado('descartado')}
                  className="px-2 py-0.5 text-[11px] font-semibold text-faint transition-colors hover:text-danger disabled:opacity-40"
                  title="Lo evalué y no aplica"
                >
                  no aplica
                </button>
              )}
              {r.estado !== 'pendiente' && (
                <button
                  disabled={pending}
                  onClick={() => onEstado('pendiente')}
                  className="px-2 py-0.5 text-[11px] font-semibold text-faint transition-colors hover:text-brand disabled:opacity-40"
                >
                  ↺
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  )
}

export function CatalogoSection({ catalogo }: { catalogo: CatalogoDesarrollo }): React.ReactElement {
  const [pending, startTransition] = useTransition()
  const [verRubros, setVerRubros] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sin esto un fallo del server action no deja rastro: el botón parece no hacer
  // nada, que es el mismo síntoma del bug de los diálogos suprimidos (bd42560).
  function estado(id: string, e: 'pendiente' | 'en_curso' | 'hecho' | 'descartado'): void {
    setError(null)
    startTransition(async () => {
      try {
        await marcarRecursoAction(id, e)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo guardar el estado.')
      }
    })
  }

  function practicar(id: string): void {
    setError(null)
    startTransition(async () => {
      try {
        await practicarRecursoAction(id)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo registrar la práctica.')
      }
    })
  }

  const { resumen } = catalogo

  return (
    <Seccion
      titulo="Material"
      resumen={
        <>
          <span className="num">{resumen.total}</span> recursos · <span className="num">{resumen.hechos}</span> hechos ·{' '}
          <span className="num">{resumen.enCurso}</span> en curso · <span className="num">{resumen.practicados}</span>{' '}
          prácticas
        </>
      }
      contador={resumen.total}
      defaultAbierto={false}
    >
      <p className="text-xs text-muted">
        Esto es el 10% del 70-20-10: existe para que la práctica sea deliberada, no para leerse completo.
      </p>

      {error && (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {catalogo.practicas.length > 0 && (
        <section>
          <h2 className="lbl">Prácticas — el 70%</h2>
          <p className="mt-1 text-xs text-muted">
            Estos no se terminan, se repiten. Son lo que convierte una oportunidad en algo intencional.
          </p>
          <ul className="mt-2">
            {catalogo.practicas.map((r) => (
              <Recurso key={r.id} r={r} pending={pending} onEstado={(e) => estado(r.id, e)} onPracticar={() => practicar(r.id)} />
            ))}
          </ul>
        </section>
      )}

      {catalogo.porObjetivo.length > 0 && (
        <section>
          <h2 className="lbl">Material por reactivo del nivel objetivo</h2>
          <div className="mt-2 space-y-4">
            {catalogo.porObjetivo.map((o) => (
              <div key={o.orden}>
                <p className="flex items-start gap-2 text-sm">
                  <span
                    className={`num mt-0.5 inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-[11px] font-semibold ${
                      o.conEvidencia ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger'
                    }`}
                  >
                    {o.orden}
                  </span>
                  <span className="font-medium text-ink">{o.texto}</span>
                </p>
                {o.recursos.length === 0 ? (
                  <p className="ml-8 mt-1 text-xs text-faint">Sin material mapeado todavía.</p>
                ) : (
                  <ul className="ml-8 mt-1">
                    {o.recursos.map((r) => (
                      <Recurso
                        key={r.id}
                        r={r}
                        pending={pending}
                        onEstado={(e) => estado(r.id, e)}
                        onPracticar={() => practicar(r.id)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between gap-2">
          <h2 className="lbl">Material por rubro</h2>
          <button onClick={() => setVerRubros(!verRubros)} className={BTN_MINI}>
            {verRubros ? 'Ocultar' : `Ver ${catalogo.porRubro.length} rubros`}
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">Ordenados con el rubro más hueco primero.</p>
        {verRubros && (
          <div className="mt-2 space-y-4">
            {catalogo.porRubro.map((g) => (
              <div key={g.rubro}>
                <p className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{g.rubro}</span>
                  <span className="num text-xs text-muted">
                    {g.conEvidencia}/{g.total} con evidencia
                  </span>
                </p>
                <ul className="mt-1">
                  {g.recursos.map((r) => (
                    <Recurso
                      key={r.id}
                      r={r}
                      pending={pending}
                      onEstado={(e) => estado(r.id, e)}
                      onPracticar={() => practicar(r.id)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </Seccion>
  )
}
