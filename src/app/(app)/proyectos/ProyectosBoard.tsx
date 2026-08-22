import Link from 'next/link'

type Proyecto = {
  id: string
  nombre: string
  cliente: string | null
  tipo: string
  color: string
  estatus: string
  cargaActivaHoras: number
}
type Compliance = { projectId: string; pctObjetivo: number; pctReal: number }
type LedgerAliado = { projectNombre: string; horasAliado: number; valorizado: number | null; dolores: string[] }

export function ProyectosBoard({
  proyectos,
  compliance,
  utilizacion,
  ledgerAliado,
}: {
  proyectos: Proyecto[]
  compliance: Compliance[]
  utilizacion: { facturableHoras: number; aliadoHoras: number; internoHoras: number; pctFacturable: number }
  ledgerAliado: LedgerAliado[]
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-8 p-4">
      <h1 className="text-2xl font-semibold text-ink">Proyectos</h1>

      <section className="space-y-2">
        <h2 className="lbl">Utilización</h2>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-hair">
          <div className="bg-brand" style={{ width: `${utilizacion.pctFacturable}%` }} title="Facturable" />
          <div className="bg-muted" style={{ width: `${(utilizacion.aliadoHoras / (utilizacion.facturableHoras + utilizacion.aliadoHoras + utilizacion.internoHoras || 1)) * 100}%` }} title="Aliado" />
        </div>
        <p className="text-xs text-muted">
          Facturable <span className="num">{utilizacion.facturableHoras.toFixed(1)}</span>h · Aliado{' '}
          <span className="num">{utilizacion.aliadoHoras.toFixed(1)}</span>h · Interno{' '}
          <span className="num">{utilizacion.internoHoras.toFixed(1)}</span>h
        </p>
      </section>

      <section className="hair pt-6">
        <div className="grid grid-cols-[1fr_84px_84px_130px] gap-4 px-1 pb-2">
          <span className="lbl">Proyecto</span>
          <span className="lbl text-right">Activas</span>
          <span className="lbl text-right">Aliado</span>
          <span className="lbl text-right">Asignación</span>
        </div>
        <div className="divide-y divide-hair">
          {proyectos.map((p) => {
            const comp = compliance.find((c) => c.projectId === p.id)
            const aliado = ledgerAliado.find((l) => l.projectNombre === p.nombre)
            return (
              <Link
                key={p.id}
                href={`/proyectos/${p.id}`}
                className="grid grid-cols-[1fr_84px_84px_130px] items-center gap-4 px-1 py-3 hover:bg-surface"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                  <span className="truncate font-medium text-ink">{p.nombre}</span>
                  {p.cliente && <span className="shrink-0 truncate text-xs text-faint">· {p.cliente}</span>}
                </div>
                <span className="num text-right text-sm text-muted">{p.cargaActivaHoras.toFixed(1)}h</span>
                {aliado ? (
                  <span className="num text-right text-sm text-brand-deep">{aliado.horasAliado.toFixed(1)}h</span>
                ) : (
                  <span />
                )}
                {comp ? (
                  <span className="num text-right text-xs text-muted">
                    {comp.pctObjetivo}% · {comp.pctReal.toFixed(0)}%
                  </span>
                ) : (
                  <span />
                )}
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}
