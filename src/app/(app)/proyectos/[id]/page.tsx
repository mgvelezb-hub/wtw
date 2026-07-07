import { verifySession } from '@/lib/auth'
import { getProyectoDetalle } from './service'

export default async function ProyectoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession()
  if (!session) return null

  const { id } = await params
  const detalle = await getProyectoDetalle(session.userId, id)

  if (!detalle) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-neutral-50">
        <p className="text-sm text-neutral-500">Proyecto no encontrado.</p>
      </main>
    )
  }

  return (
    <main className="min-h-dvh bg-neutral-50">
      <div className="mx-auto max-w-2xl space-y-6 p-4">
        <div>
          <h1 className="text-lg font-bold text-neutral-900">{detalle.project.nombre}</h1>
          {detalle.project.cliente && <p className="text-sm text-neutral-500">{detalle.project.cliente}</p>}
        </div>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase text-neutral-500">Entregables</h2>
          <div className="space-y-2">
            {detalle.entregables.map((e) => (
              <div key={e.id} className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-neutral-900">{e.nombre}</span>
                  <span className={e.semaforo === 'atrasado' ? 'text-red-600' : 'text-green-600'}>
                    {e.semaforo === 'atrasado' ? '🔴 Atrasado' : '🟢 A tiempo'}
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                  <div className="h-full bg-[#0A7C82]" style={{ width: `${e.avancePct}%` }} />
                </div>
                <p className="mt-1 text-xs text-neutral-500">{e.avancePct}% avance</p>
              </div>
            ))}
            {detalle.entregables.length === 0 && <p className="text-sm text-neutral-400">Sin entregables registrados.</p>}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase text-neutral-500">Pendientes abiertos</h2>
          <div className="space-y-2">
            {detalle.issuesAbiertos.map((i) => (
              <div key={i.id} className="rounded-lg border border-neutral-200 bg-white p-3 text-sm shadow-sm">
                <span className="mr-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs uppercase text-neutral-500">{i.tipo}</span>
                {i.descripcion}
              </div>
            ))}
            {detalle.issuesAbiertos.length === 0 && <p className="text-sm text-neutral-400">Sin pendientes abiertos.</p>}
          </div>
        </section>
      </div>
    </main>
  )
}
