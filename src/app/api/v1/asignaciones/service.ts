import { prisma } from '@/lib/prisma'

export type Compliance = { projectId: string; projectNombre: string; pctObjetivo: number; pctReal: number }

export async function complianceForWeek(userId: string, ahora: Date = new Date()): Promise<Compliance[]> {
  const allocations = await prisma.allocation.findMany({
    where: { userId, vigenteDesde: { lte: ahora }, OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: ahora } }] },
    include: { project: true },
  })
  if (allocations.length === 0) return []

  const entries = await prisma.timeEntry.findMany({
    where: { userId, stoppedAt: { not: null } },
    include: { task: true },
  })
  const totalSec = entries.reduce((s, e) => s + e.seconds, 0)

  return allocations.map((a) => {
    const projectSec = entries.filter((e) => e.task.projectId === a.projectId).reduce((s, e) => s + e.seconds, 0)
    return {
      projectId: a.projectId,
      projectNombre: a.project.nombre,
      pctObjetivo: a.pct,
      pctReal: totalSec > 0 ? (projectSec / totalSec) * 100 : 0,
    }
  })
}
