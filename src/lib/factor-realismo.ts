import { prisma } from './prisma'

const MIN_SEMANAS = 3

export async function computeFactorRealismo(userId: string): Promise<number> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  const manual = user.factorManual ? Number(user.factorManual) : 1.4

  const semanas = await prisma.week.count({ where: { userId, estatus: 'closed' } })
  if (semanas < MIN_SEMANAS) return manual

  const tasks = await prisma.task.findMany({
    where: { userId, estatus: 'done', estimadoMin: { not: null } },
    include: { timeEntries: true },
  })
  const ratios = tasks
    .map((t) => {
      const realMin = t.timeEntries.reduce((s, e) => s + e.seconds, 0) / 60
      return realMin > 0 && t.estimadoMin ? realMin / t.estimadoMin : null
    })
    .filter((r): r is number => r !== null)

  if (ratios.length === 0) return manual
  const promedio = ratios.reduce((a, b) => a + b, 0) / ratios.length
  return Math.round((0.6 * manual + 0.4 * promedio) * 100) / 100
}
