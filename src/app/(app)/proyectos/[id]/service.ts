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
    return {
      id: d.id,
      nombre: d.nombre,
      avancePct: d.avancePct,
      presentado: d.presentado,
      presentadoA: d.presentadoA,
      semaforo,
    }
  })

  return { project, entregables, issuesAbiertos: project.issues }
}

// Un entregable PRESENTADO en persona es evidencia de "Quien presenta" y de "La
// mano del Rey" (ver comentario en el schema); uno enviado por correo no lo es.
// Se ancla al reactivo de orden más bajo de cada rol — Evidence.competencyId es
// singular, no hay forma de repartir un solo clic entre los 3 reactivos del rol.
export async function marcarPresentado(
  userId: string,
  deliverableId: string,
  presentado: boolean,
  presentadoA?: string,
): Promise<void> {
  const entregable = await prisma.deliverable.findFirst({
    where: { id: deliverableId, project: { userId } },
    select: { id: true, nombre: true },
  })
  if (!entregable) throw new Error('entregable no encontrado')

  await prisma.deliverable.update({
    where: { id: deliverableId },
    data: { presentado, presentadoA: presentado ? (presentadoA?.trim() || null) : null },
  })

  if (!presentado) return // no se borra evidencia ya generada al desmarcar

  for (const grupo of ['Quien presenta', 'La mano del Rey'] as const) {
    const competencia = await prisma.competency.findFirst({
      where: { tipo: 'rol', grupo },
      orderBy: { orden: 'asc' },
      select: { id: true },
    })
    if (!competencia) continue // datos de seed no cargados — no debe tronar

    const yaExiste = await prisma.evidence.findFirst({
      where: { userId, competencyId: competencia.id, deliverableId },
      select: { id: true },
    })
    if (yaExiste) continue // idempotente: prender/apagar/prender no duplica

    await prisma.evidence.create({
      data: {
        userId,
        competencyId: competencia.id,
        deliverableId,
        nota: `Entregable presentado en persona: "${entregable.nombre}"${
          presentadoA ? ` — ante ${presentadoA}` : ''
        }`,
      },
    })
  }
}
