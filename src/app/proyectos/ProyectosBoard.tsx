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

export function ProyectosBoard({
  proyectos,
  compliance,
  utilizacion,
}: {
  proyectos: Proyecto[]
  compliance: Compliance[]
  utilizacion: { facturableHoras: number; aliadoHoras: number; internoHoras: number; pctFacturable: number }
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-lg font-bold text-neutral-900">Proyectos</h1>

      <section className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
        <h2 className="mb-2 text-xs font-semibold uppercase text-neutral-500">Utilización</h2>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-neutral-100">
          <div className="bg-[#0A7C82]" style={{ width: `${utilizacion.pctFacturable}%` }} title="Facturable" />
          <div className="bg-[#B8860B]" style={{ width: `${(utilizacion.aliadoHoras / (utilizacion.facturableHoras + utilizacion.aliadoHoras + utilizacion.internoHoras || 1)) * 100}%` }} title="Aliado" />
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Facturable {utilizacion.facturableHoras.toFixed(1)}h · Aliado {utilizacion.aliadoHoras.toFixed(1)}h · Interno{' '}
          {utilizacion.internoHoras.toFixed(1)}h
        </p>
      </section>

      <section className="space-y-2">
        {proyectos.map((p) => {
          const comp = compliance.find((c) => c.projectId === p.id)
          return (
            <Link
              key={p.id}
              href={`/proyectos/${p.id}`}
              className="block rounded-lg border border-neutral-200 bg-white p-3 shadow-sm hover:border-neutral-300"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                  <span className="font-medium text-neutral-900">{p.nombre}</span>
                  {p.cliente && <span className="text-xs text-neutral-400">· {p.cliente}</span>}
                </div>
                <span className="text-sm text-neutral-500">{p.cargaActivaHoras.toFixed(1)}h activas</span>
              </div>
              {comp && (
                <p className="mt-1 text-xs text-neutral-500">
                  Asignación: {comp.pctObjetivo}% objetivo · {comp.pctReal.toFixed(0)}% real
                </p>
              )}
            </Link>
          )
        })}
      </section>
    </div>
  )
}
