import { prisma } from '@/lib/prisma'

export type HistoricoWeek = {
  isoWeek: string
  factorUsado: number
  winsLogrados: number
  winsTotal: number
  // Suma de Block.planMin de la semana. null si la semana no tiene bloques.
  minutosPlaneados: number | null
  // Suma de TimeEntry.seconds/60 de las tareas de esa semana. null si no hay registros.
  minutosMedidos: number | null
}

export async function getHistorico(userId: string): Promise<HistoricoWeek[]> {
  const weeks = await prisma.week.findMany({
    where: { userId, estatus: 'closed' },
    include: { wins: true },
    orderBy: { rangoInicio: 'desc' },
  })

  if (weeks.length === 0) return []

  const weekIds = weeks.map((w) => w.id)

  // Planeado: Block cuelga directo de Week con planMin — agregable barato con groupBy.
  const plannedRows = await prisma.block.groupBy({
    by: ['weekId'],
    where: { weekId: { in: weekIds } },
    _sum: { planMin: true },
  })
  const plannedByWeek = new Map(plannedRows.map((r) => [r.weekId, r._sum.planMin ?? 0]))

  // Medido: TimeEntry no tiene weekId propio, solo taskId. Task sí tiene weekId
  // (nullable). Se filtra por userId (doble scope: TimeEntry.userId + Task.weekId
  // que ya viene de semanas del usuario) y se reduce en memoria — el volumen por
  // semana cerrada es pequeño, no vale la pena una vista o raw SQL.
  const entries = await prisma.timeEntry.findMany({
    where: { userId, task: { weekId: { in: weekIds } } },
    select: { seconds: true, task: { select: { weekId: true } } },
  })
  const measuredByWeek = new Map<string, number>()
  for (const entry of entries) {
    const weekId = entry.task.weekId
    if (!weekId) continue
    measuredByWeek.set(weekId, (measuredByWeek.get(weekId) ?? 0) + entry.seconds)
  }

  return weeks.map((w) => ({
    isoWeek: w.isoWeek,
    factorUsado: Number(w.factorUsado),
    winsLogrados: w.wins.filter((win) => win.estatus === 'logrado').length,
    winsTotal: w.wins.length,
    minutosPlaneados: plannedByWeek.has(w.id) ? (plannedByWeek.get(w.id) as number) : null,
    minutosMedidos: measuredByWeek.has(w.id) ? Math.round((measuredByWeek.get(w.id) as number) / 60) : null,
  }))
}
