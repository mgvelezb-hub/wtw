import { prisma } from './prisma'

const MIN_SEMANAS = 3

// OJO: hoy nada en `src/` llama estas funciones — solo los tests. El planeador usa
// `user.factorManual ?? 1.4` directo en `contextoPlaneacion`, así que el cálculo
// automático está HUÉRFANO. Cablearlo es Track A del plan
// `docs/plans/2026-08-12-metodologias-post-compuerta.md` (factores por clase de
// referencia), y ahí es donde debe decidirse — no de pasada.

export type FactorDetalle = {
  factor: number
  // Cuántas tareas entraron al promedio, y cuántas de ellas traen tiempo METIDO A
  // MANO en vez de cronometrado. Un factor calculado sobre entradas manuales no es
  // una medición: el número que uno teclea está anclado a lo que estimó, así que
  // tiende a confirmar la estimación en vez de corregirla.
  muestras: number
  muestrasManuales: number
  // true cuando la mayoría del insumo es manual. Es la misma idea que
  // `medicionIncompleta` en el recap: el número se sigue dando, pero marcado.
  insumoMayormenteManual: boolean
  // true cuando todavía no hay 3 semanas cerradas y se devuelve el manual tal cual.
  esManualPuro: boolean
}

export async function factorRealismoDetalle(userId: string): Promise<FactorDetalle> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  const manual = user.factorManual ? Number(user.factorManual) : 1.4
  const base = { factor: manual, muestras: 0, muestrasManuales: 0, insumoMayormenteManual: false, esManualPuro: true }

  const semanas = await prisma.week.count({ where: { userId, estatus: 'closed' } })
  if (semanas < MIN_SEMANAS) return base

  const tasks = await prisma.task.findMany({
    where: { userId, estatus: 'done', estimadoMin: { not: null } },
    include: { timeEntries: true },
  })

  const muestras = tasks
    .map((t) => {
      const realMin = t.timeEntries.reduce((s, e) => s + e.seconds, 0) / 60
      if (realMin <= 0 || !t.estimadoMin) return null
      return {
        ratio: realMin / t.estimadoMin,
        // Manual si NINGUNA de sus entradas salió del cronómetro.
        manual: t.timeEntries.every((e) => e.manual),
      }
    })
    .filter((m): m is { ratio: number; manual: boolean } => m !== null)

  if (muestras.length === 0) return base

  const promedio = muestras.reduce((a, m) => a + m.ratio, 0) / muestras.length
  const manuales = muestras.filter((m) => m.manual).length

  return {
    factor: Math.round((0.6 * manual + 0.4 * promedio) * 100) / 100,
    muestras: muestras.length,
    muestrasManuales: manuales,
    insumoMayormenteManual: manuales > muestras.length / 2,
    esManualPuro: false,
  }
}

export async function computeFactorRealismo(userId: string): Promise<number> {
  return (await factorRealismoDetalle(userId)).factor
}
