import { prisma } from '@/lib/prisma'

type Semaforo = 'a_tiempo' | 'atrasado'

export async function getProyectoDetalle(userId: string, projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { deliverables: { orderBy: { createdAt: 'asc' } }, issues: { where: { estatus: 'abierto' } } },
  })
  if (!project || project.userId !== userId) return null

  const entregables = project.deliverables.map((d) => {
    let semaforo: Semaforo = 'a_tiempo'
    if (d.fechaProyectada && d.fechaComprometida && d.fechaProyectada > d.fechaComprometida) semaforo = 'atrasado'
    return { ...d, semaforo }
  })

  return { project, entregables, issuesAbiertos: project.issues }
}
