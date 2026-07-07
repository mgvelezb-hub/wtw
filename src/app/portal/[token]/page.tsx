import { notFound } from 'next/navigation'
import { getPortalData } from './service'

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const data = await getPortalData(token)
  if (!data) notFound()

  return (
    <main className="min-h-dvh bg-neutral-50 p-4">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-lg font-bold text-neutral-900">{data.proyecto.nombre}</h1>
          <p className="text-sm text-neutral-500">Estatus del proyecto</p>
        </div>

        <section className="space-y-2">
          {data.entregables.map((e) => (
            <div key={e.nombre} className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
              <div className="flex justify-between">
                <span className="font-medium text-neutral-900">{e.nombre}</span>
                <span className="text-sm text-neutral-500">{e.avancePct}%</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                <div className="h-full bg-[#0A7C82]" style={{ width: `${e.avancePct}%` }} />
              </div>
            </div>
          ))}
          {data.entregables.length === 0 && <p className="text-sm text-neutral-400">Sin entregables registrados.</p>}
        </section>

        {data.apoyoRequerido.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase text-neutral-500">Apoyo requerido</h2>
            <div className="space-y-2">
              {data.apoyoRequerido.map((a, i) => (
                <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  {a.descripcion}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
