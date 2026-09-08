import { prisma } from '@/lib/prisma'
import { isoWeekOf, weekRangeFull, rangoDiaMx, todayStr } from '@/lib/dates'

export type Compliance = {
  projectId: string
  projectNombre: string
  pctObjetivo: number
  // `null` cuando la semana todavía no tiene un solo minuto cronometrado. Un 0%
  // ahí diría "no le dediqué nada", que es una afirmación; la verdad es que no
  // hay medición, y la app no inventa números que no midió.
  pctReal: number | null
}

// El objetivo de una allocation es SEMANAL, así que lo real tiene que serlo
// también. Antes esto sumaba todos los TimeEntry de la historia contra un
// objetivo de la semana: un proyecto que ocupó seis meses del año pasado
// aplastaba el porcentaje del que hoy tiene el 100% de la asignación, y la
// columna "Asignación" mentía en la dirección más cara — la de creer que se
// está cumpliendo un compromiso que no se está cumpliendo.
//
// La ventana es lunes a domingo (`weekRangeFull`), no la jornada lun–vie: lo
// que se mide aquí es a dónde se fue el tiempo REAL, y el trabajo de fin de
// semana es tiempo real. Las fronteras son días de México, no UTC.
export async function complianceForWeek(userId: string, ahora: Date = new Date()): Promise<Compliance[]> {
  const allocations = await prisma.allocation.findMany({
    where: { userId, vigenteDesde: { lte: ahora }, OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: ahora } }] },
    include: { project: true },
  })
  if (allocations.length === 0) return []

  const semana = weekRangeFull(isoWeekOf(new Date(`${todayStr(ahora)}T00:00:00Z`)))
  const { desde } = rangoDiaMx(semana.inicio.toISOString().slice(0, 10))
  const { hasta } = rangoDiaMx(semana.fin.toISOString().slice(0, 10))

  const entries = await prisma.timeEntry.findMany({
    where: { userId, stoppedAt: { not: null }, startedAt: { gte: desde, lt: hasta } },
    include: { task: true },
  })
  const totalSec = entries.reduce((s, e) => s + e.seconds, 0)

  return allocations.map((a) => {
    const projectSec = entries.filter((e) => e.task.projectId === a.projectId).reduce((s, e) => s + e.seconds, 0)
    return {
      projectId: a.projectId,
      projectNombre: a.project.nombre,
      pctObjetivo: a.pct,
      pctReal: totalSec > 0 ? (projectSec / totalSec) * 100 : null,
    }
  })
}
