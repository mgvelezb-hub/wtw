import { verifySession } from '@/lib/auth'
import { getProyectoDetalle } from './service'
import { listMinutasAction, listStatusArtifactsAction } from './status-actions'
import { MinutasSection } from './MinutasSection'
import { StatusEquipoSection } from './StatusEquipoSection'
import { EntregablesSection } from './EntregablesSection'

export default async function ProyectoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession()
  if (!session) return null

  const { id } = await params
  const detalle = await getProyectoDetalle(session.userId, id)

  if (!detalle) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-paper">
        <p className="text-sm text-muted">Proyecto no encontrado.</p>
      </main>
    )
  }

  const [minutas, artifacts] = await Promise.all([
    listMinutasAction(id),
    listStatusArtifactsAction(id),
  ])

  return (
    <main className="min-h-dvh bg-paper">
      <div className="mx-auto max-w-2xl space-y-8 p-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{detalle.project.nombre}</h1>
          {detalle.project.cliente && <p className="text-sm text-muted">{detalle.project.cliente}</p>}
        </div>

        <EntregablesSection entregables={detalle.entregables} projectId={id} />

        <section className="hair pt-6">
          <h2 className="lbl mb-2">Pendientes abiertos</h2>
          <div className="divide-y divide-hair">
            {detalle.issuesAbiertos.map((i) => (
              <div key={i.id} className="flex items-start gap-2 py-2 text-sm text-ink">
                <span className="lbl shrink-0">{i.tipo}</span>
                {i.descripcion}
              </div>
            ))}
            {detalle.issuesAbiertos.length === 0 && <p className="text-sm text-faint">Sin pendientes abiertos.</p>}
          </div>
        </section>

        <MinutasSection minutas={minutas} />

        <StatusEquipoSection projectId={id} artifactsIniciales={artifacts} />
      </div>
    </main>
  )
}
