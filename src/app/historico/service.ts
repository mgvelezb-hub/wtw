import { prisma } from '@/lib/prisma'

export async function getHistorico(userId: string) {
  const weeks = await prisma.week.findMany({
    where: { userId, estatus: 'closed' },
    include: { wins: true },
    orderBy: { rangoInicio: 'desc' },
  })

  return weeks.map((w) => ({
    isoWeek: w.isoWeek,
    factorUsado: Number(w.factorUsado),
    winsLogrados: w.wins.filter((win) => win.estatus === 'logrado').length,
    winsTotal: w.wins.length,
  }))
}
