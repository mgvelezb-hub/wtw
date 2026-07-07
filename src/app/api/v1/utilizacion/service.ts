import { prisma } from '@/lib/prisma'

export type Utilizacion = {
  facturableHoras: number
  aliadoHoras: number
  internoHoras: number
  pctFacturable: number
}

export async function computeUtilizacion(userId: string, desde?: Date, hasta?: Date): Promise<Utilizacion> {
  const entries = await prisma.timeEntry.findMany({
    where: {
      userId,
      stoppedAt: { not: null },
      ...(desde && hasta ? { startedAt: { gte: desde, lte: hasta } } : {}),
    },
    include: { task: { include: { project: true } } },
  })

  let facturableSec = 0
  let aliadoSec = 0
  let internoSec = 0

  for (const e of entries) {
    const project = e.task.project
    if (e.task.alcance === 'aliado') aliadoSec += e.seconds
    else if (project?.tipo === 'facturable') facturableSec += e.seconds
    else internoSec += e.seconds
  }

  const totalSec = facturableSec + aliadoSec + internoSec
  return {
    facturableHoras: facturableSec / 3600,
    aliadoHoras: aliadoSec / 3600,
    internoHoras: internoSec / 3600,
    pctFacturable: totalSec > 0 ? (facturableSec / totalSec) * 100 : 0,
  }
}
