import { prisma } from '@/lib/prisma'

export async function getLedgerAliado(userId: string) {
  const tasks = await prisma.task.findMany({
    where: { userId, alcance: 'aliado', projectId: { not: null } },
    include: { project: true, timeEntries: { where: { stoppedAt: { not: null } } } },
  })

  const porProyecto = new Map<
    string,
    { projectNombre: string; segundos: number; tarifaHora: number | null; dolores: Set<string> }
  >()

  for (const t of tasks) {
    const key = t.projectId!
    const acc = porProyecto.get(key) ?? {
      projectNombre: t.project!.nombre,
      segundos: 0,
      tarifaHora: t.project!.tarifaHora ? Number(t.project!.tarifaHora) : null,
      dolores: new Set<string>(),
    }
    acc.segundos += t.timeEntries.reduce((s, e) => s + e.seconds, 0)
    if (t.dolorCliente) acc.dolores.add(t.dolorCliente)
    porProyecto.set(key, acc)
  }

  return Array.from(porProyecto.values()).map((p) => ({
    projectNombre: p.projectNombre,
    horasAliado: p.segundos / 3600,
    valorizado: p.tarifaHora ? Math.round((p.segundos / 3600) * p.tarifaHora) : null,
    dolores: Array.from(p.dolores),
  }))
}
