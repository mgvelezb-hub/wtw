import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { competenciasParaPlaneacion } from '@/app/(app)/desarrollo/service'
import { getMapaStakeholders } from './service'
import { StakeholdersBoard } from './StakeholdersBoard'

export default async function StakeholdersPage() {
  const session = await verifySession()
  if (!session) redirect('/login')

  const [mapa, proyectos, competencias] = await Promise.all([
    getMapaStakeholders(session.userId),
    prisma.project.findMany({
      where: { userId: session.userId, estatus: 'activo' },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
    competenciasParaPlaneacion(session.userId),
  ])

  return (
    <main className="min-h-dvh bg-neutral-50">
      <div className="mx-auto max-w-3xl p-4">
        <StakeholdersBoard mapa={mapa} proyectos={proyectos} competencias={competencias} />
      </div>
    </main>
  )
}
