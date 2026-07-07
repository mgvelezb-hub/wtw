import { verifySession } from '@/lib/auth'
import { listProyectosConCarga } from './service'
import { complianceForWeek } from '@/app/api/v1/asignaciones/service'
import { computeUtilizacion } from '@/app/api/v1/utilizacion/service'
import { ProyectosBoard } from './ProyectosBoard'

export default async function ProyectosPage() {
  const session = await verifySession()
  if (!session) return null

  const [proyectos, compliance, utilizacion] = await Promise.all([
    listProyectosConCarga(session.userId),
    complianceForWeek(session.userId),
    computeUtilizacion(session.userId),
  ])

  return (
    <main className="min-h-dvh bg-neutral-50">
      <ProyectosBoard proyectos={proyectos} compliance={compliance} utilizacion={utilizacion} />
    </main>
  )
}
