import { getWeek } from '@/app/api/v1/weeks/service'
import { capacityForWeek } from '@/app/api/v1/capacity/service'

export async function getWeekView(userId: string, isoWeek: string) {
  const [week, capacidad] = await Promise.all([getWeek(userId, isoWeek), capacityForWeek(userId, isoWeek)])
  if (!week) return null
  const cargaMin = week.tasks.reduce((s, t) => s + (t.ajustadoMin ?? t.estimadoMin ?? 0), 0)
  return { week, capacidad, cargaHoras: cargaMin / 60 }
}
