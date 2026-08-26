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

  const fechas: Date[] = []
  for (let i = 0; i < 5; i++) {
    const fecha = new Date(inicio)
    fecha.setUTCDate(fecha.getUTCDate() + i)
    fechas.push(fecha)
  }

  // Las tres consultas de la semana salen de una vez y no una por día: el bucle
  // hacía N+1 contra Neon, y ahora además necesitaría una cuarta por los bloques.
  const [overrides, eventos, juntas] = await Promise.all([
    prisma.dayOverride.findMany({ where: { userId, fecha: { in: fechas } } }),
    prisma.calendarEvent.findMany({
      where: { userId, fecha: { in: fechas }, cancelado: false, bloqueante: true },
    }),
    // Juntas internas: las que Mau agenda a mano, sin pasar por Outlook. Ocupan
    // tiempo real igual que las externas, pero hasta ahora eran invisibles para
    // la capacidad — una reunión de 90 min era tiempo fantasma y el día se veía
    // más vacío de lo que estaba. /semana ya las contaba como comprometidas: la
    // capacidad era la única de las tres bases que no las veía.
    //
    // Se suma `planMin` y no `fin - inicio` porque una junta puede ser flex (sin
    // hora acordada todavía) y aun así ocupar la tarde.
    //
    // Solo `junta`: un bloque de TAREA no resta capacidad, porque la carga de
    // trabajo se compara CONTRA la capacidad. Restarla aquí la contaría dos
    // veces y el día se vería lleno con la mitad del trabajo.
    prisma.block.findMany({
      where: { week: { userId }, fecha: { in: fechas }, tipo: 'junta' },
      select: { fecha: true, planMin: true },
    }),
  ])

  const overridePorFecha = new Map(overrides.map((o) => [o.fecha.toISOString().slice(0, 10), o]))
  const minPorFecha = new Map<string, number>()
  for (const e of eventos) {
    const k = e.fecha.toISOString().slice(0, 10)
    minPorFecha.set(k, (minPorFecha.get(k) ?? 0) + (toMin(e.fin) - toMin(e.inicio)))
  }
  for (const j of juntas) {
    const k = j.fecha.toISOString().slice(0, 10)
    minPorFecha.set(k, (minPorFecha.get(k) ?? 0) + j.planMin)
  }

  const dias: DiaCapacidad[] = fechas.map((fecha) => {
    const fechaStr = fecha.toISOString().slice(0, 10)
    const override = overridePorFecha.get(fechaStr)
    if (override && !override.inicio) return { fecha: fechaStr, horasLibres: 0 }

    const horarioInicio = override?.inicio ?? user.horarioInicio
    const horarioFin = override?.fin ?? user.horarioFin
    const jornadaMin =
      toMin(horarioFin) - toMin(horarioInicio) - (toMin(user.comidaFin) - toMin(user.comidaInicio))

    return { fecha: fechaStr, horasLibres: Math.max(0, jornadaMin - (minPorFecha.get(fechaStr) ?? 0)) / 60 }
  })

  const trabajableTotal = dias.reduce((s, d) => s + d.horasLibres, 0)
  return { dias, trabajableTotal, trabajablePlaneable: trabajableTotal * (1 - user.bufferPct / 100) }
}
