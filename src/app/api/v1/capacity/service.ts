import { prisma } from '@/lib/prisma'
import { weekRange } from '@/lib/dates'

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export type DiaCapacidad = { fecha: string; horasLibres: number }
export type CapacidadSemana = { dias: DiaCapacidad[]; trabajableTotal: number; trabajablePlaneable: number }

export async function capacityForWeek(userId: string, isoWeek: string): Promise<CapacidadSemana> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  const { inicio } = weekRange(isoWeek)

  const dias: DiaCapacidad[] = []
  for (let i = 0; i < 5; i++) {
    const fecha = new Date(inicio)
    fecha.setUTCDate(fecha.getUTCDate() + i)
    const fechaStr = fecha.toISOString().slice(0, 10)

    const override = await prisma.dayOverride.findUnique({ where: { userId_fecha: { userId, fecha } } })
    if (override && !override.inicio) {
      dias.push({ fecha: fechaStr, horasLibres: 0 })
      continue
    }

    const horarioInicio = override?.inicio ?? user.horarioInicio
    const horarioFin = override?.fin ?? user.horarioFin
    let libreMin = toMin(horarioFin) - toMin(horarioInicio) - (toMin(user.comidaFin) - toMin(user.comidaInicio))

    const eventos = await prisma.calendarEvent.findMany({ where: { userId, fecha } })
    for (const e of eventos) libreMin -= toMin(e.fin) - toMin(e.inicio)

    dias.push({ fecha: fechaStr, horasLibres: Math.max(0, libreMin) / 60 })
  }

  const trabajableTotal = dias.reduce((s, d) => s + d.horasLibres, 0)
  return { dias, trabajableTotal, trabajablePlaneable: trabajableTotal * (1 - user.bufferPct / 100) }
}
