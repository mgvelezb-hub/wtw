import { prisma } from '@/lib/prisma'

export async function listProyectosConCarga(userId: string) {
  const proyectos = await prisma.project.findMany({
    where: { userId },
    include: { tasks: { where: { estatus: { in: ['planned', 'in_progress'] } } } },
    orderBy: { nombre: 'asc' },
  })

  return proyectos.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    cliente: p.cliente,
    tipo: p.tipo,
    color: p.color,
    estatus: p.estatus,
    cargaActivaHoras: p.tasks.reduce((s, t) => s + (t.ajustadoMin ?? t.estimadoMin ?? 0), 0) / 60,
  }))
}
