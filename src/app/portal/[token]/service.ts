import { prisma } from '@/lib/prisma'
import { hashPortalToken } from '@/lib/tokens'

export async function getPortalData(token: string) {
  const project = await prisma.project.findUnique({
    where: { portalTokenHash: hashPortalToken(token) },
    include: {
      deliverables: { orderBy: { createdAt: 'asc' } },
      issues: { where: { estatus: 'abierto' } },
    },
  })
  if (!project) return null

  return {
    proyecto: { nombre: project.nombre, cliente: project.cliente },
    entregables: project.deliverables.map((d) => ({
      nombre: d.nombre,
      avancePct: d.avancePct,
      fechaComprometida: d.fechaComprometida,
      estatus: d.estatus,
    })),
    apoyoRequerido: project.issues
      .filter((i) => i.responsable?.toLowerCase().includes('cliente'))
      .map((i) => ({ descripcion: i.descripcion, fechaCompromiso: i.fechaCompromiso })),
  }
}
