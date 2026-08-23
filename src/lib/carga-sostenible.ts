import { prisma } from '@/lib/prisma'
import { isoWeekOf } from '@/lib/dates'
import { isoWeekAnterior } from '@/app/(app)/semana/nueva/service'
import { capacityForWeek } from '@/app/api/v1/capacity/service'
import { getPatronDesvios } from '@/app/(app)/cierre/service'

// Semáforo de sobrecarga — tres señales del modelo JD-R (Job Demands-Resources).
//
// No mide "cansancio" (eso no está en los datos): mide sus tres precursores
// observables, cada uno con su propia justificación empírica:
//
//   1. Sobrecompromiso sostenido — Bakker (2023) describe las "espirales de
//      pérdida": la sobrecarga de una semana no se paga en esa semana, se
//      arrastra. Una semana sobrecargada es una mala racha; dos de tres es un
//      patrón que ya no se explica por una junta que se alargó.
//   2. Erosión de frontera — Sonnentag: la recuperación (desconexión real fuera
//      de jornada) es CONDICIÓN del desempeño sostenido, no su recompensa.
//      Trabajar sistemáticamente fuera de horario o en fin de semana es la
//      señal más temprana y más barata de medir de que la frontera se erosionó.
//   3. Espiral — el error de estimación solo, o los bomberazos solos, son
//      ruido semana a semana (un cliente exigente una semana, una tarea rara
//      la siguiente). Que AMBOS suban juntos frente a su propia ventana
//      anterior es la firma de una espiral: cada vez se estima peor porque
//      cada vez hay más interrupción, y viceversa.
//
// Todas las señales se calculan sobre datos que YA existen (Block, TimeEntry,
// DayReconciliation/Desvio, User.horario*) — no se agrega ningún campo nuevo.
// `hoy` se inyecta siempre para que el cálculo sea determinista y testeable.

export type ClaveSenal = 'sobrecompromiso' | 'erosion_frontera' | 'espiral'
export type NivelCarga = 'verde' | 'ambar' | 'rojo'

export type Senal = {
  clave: ClaveSenal
  activa: boolean
  // Siempre trae los números que la sustentan — la señal no se anuncia sola,
  // se explica sola.
  detalle: string
  // El número que encabeza la señal, para que la UI lo lea sin parsear el
  // detalle: sobrecompromiso = semanas sobrecargadas, erosión = % fuera de
  // jornada. null cuando no hay datos (o cuando ningún número solo la resume,
  // como en espiral).
  valor: number | null
}

export type ResultadoSobrecarga = {
  nivel: NivelCarga
  senales: Senal[]
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// ── Señal 1: sobrecompromiso sostenido ──────────────────────────────────────
//
// Reusa `capacityForWeek` (misma capacidad que ve el planeador) y agrega
// `Block.planMin` por semana en vez de recalcular la carga desde Task: el
// histórico de "qué se comprometió" vive en los bloques ya puestos en el
// calendario, y ahí es barato de leer — a diferencia de reconstruir, semana
// por semana, el mismo balance que arma el planeador en vivo.
//
// Umbral: ratio carga/planeable > 1 (la misma frontera que usa `validarCarga`
// en el planeador — no se inventa un segundo criterio de "sobrecargada") en
// 2 de las últimas 3 semanas ANTERIORES a `hoy` (la semana en curso no cuenta:
// todavía se está llenando, y evaluarla a medio llenar la marcaría como
// "ligera" sin serlo).
async function senalSobrecompromiso(userId: string, hoy: Date): Promise<Senal> {
  const actual = isoWeekOf(hoy)
  const w1 = isoWeekAnterior(actual)
  const w2 = isoWeekAnterior(w1)
  const w3 = isoWeekAnterior(w2)
  const semanas = [w1, w2, w3]

  const detalles: string[] = []
  let sobrecargadas = 0
  let evaluadas = 0

  for (const isoWeek of semanas) {
    const week = await prisma.week.findUnique({ where: { userId_isoWeek: { userId, isoWeek } }, select: { id: true } })
    if (!week) continue
    evaluadas++

    const [agg, capacidad] = await Promise.all([
      prisma.block.aggregate({ where: { weekId: week.id }, _sum: { planMin: true } }),
      capacityForWeek(userId, isoWeek),
    ])
    const cargaMin = agg._sum.planMin ?? 0
    const planeableMin = Math.round(capacidad.trabajablePlaneable * 60)

    const sobrecargada = planeableMin > 0 ? cargaMin > planeableMin : cargaMin > 0
    if (sobrecargada) sobrecargadas++
    const pctTexto = planeableMin > 0 ? `${Math.round((cargaMin / planeableMin) * 100)}%` : 'sin capacidad planeable'
    detalles.push(`${isoWeek}: ${pctTexto}`)
  }

  return {
    clave: 'sobrecompromiso',
    activa: sobrecargadas >= 2,
    valor: evaluadas === 0 ? null : sobrecargadas,
    detalle:
      evaluadas === 0
        ? 'Sin semanas anteriores registradas todavía.'
        : `${sobrecargadas} de ${evaluadas} semana(s) anterior(es) con carga por arriba de lo planeable (${detalles.join(', ')}).`,
  }
}

// ── Señal 2: erosión de frontera ────────────────────────────────────────────
//
// % de minutos cronometrados (TimeEntry) en los últimos 14 días que cayeron
// antes del horario de inicio, después del de fin, o en sábado/domingo —
// leyendo `User.horarioInicio/horarioFin`, la misma fuente que usa
// `capacityForWeek`. Se clasifica por la hora local de INICIO del entry (no se
// parte un entry que cruza la frontera): es una señal de patrón, no un
// cronómetro de precisión al minuto.
//
// Umbral: > 15%. Es una fracción, no una cantidad absoluta de horas —así una
// semana ligera y una semana pesada se miden con la misma vara.
const MX_TZ = 'America/Mexico_City'

function pesoLocal(d: Date): { weekday: number; minutos: number } {
  const weekdayStr = new Intl.DateTimeFormat('en-US', { timeZone: MX_TZ, weekday: 'short' }).format(d)
  const MAPA: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: MX_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const h = Number(partes.find((p) => p.type === 'hour')!.value)
  const m = Number(partes.find((p) => p.type === 'minute')!.value)
  return { weekday: MAPA[weekdayStr], minutos: h * 60 + m }
}

function fueraDeJornada(startedAt: Date, inicioMin: number, finMin: number): boolean {
  const { weekday, minutos } = pesoLocal(startedAt)
  if (weekday === 0 || weekday === 6) return true
  return minutos < inicioMin || minutos >= finMin
}

async function senalErosionFrontera(userId: string, hoy: Date): Promise<Senal> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { horarioInicio: true, horarioFin: true },
  })
  const inicioMin = toMin(user.horarioInicio)
  const finMin = toMin(user.horarioFin)

  const hasta = new Date(hoy)
  hasta.setUTCHours(23, 59, 59, 999)
  const desde = new Date(hoy)
  desde.setUTCDate(desde.getUTCDate() - 13)
  desde.setUTCHours(0, 0, 0, 0)

  const entries = await prisma.timeEntry.findMany({
    where: { userId, startedAt: { gte: desde, lte: hasta } },
    select: { startedAt: true, seconds: true },
  })

  let totalMin = 0
  let foraMin = 0
  for (const e of entries) {
    const min = e.seconds / 60
    totalMin += min
    if (fueraDeJornada(e.startedAt, inicioMin, finMin)) foraMin += min
  }

  const pct = totalMin > 0 ? (foraMin / totalMin) * 100 : 0
  return {
    clave: 'erosion_frontera',
    activa: totalMin > 0 && pct > 15,
    valor: totalMin === 0 ? null : Math.round(pct),
    detalle:
      totalMin === 0
        ? 'Sin minutos cronometrados en los últimos 14 días.'
        : `${Math.round(pct)}% de los minutos cronometrados en los últimos 14 días (${Math.round(foraMin)} de ${Math.round(totalMin)} min) cayeron fuera de tu jornada o en fin de semana.`,
  }
}

// ── Señal 3: espiral ─────────────────────────────────────────────────────────
//
// Compara los últimos 14 días contra los 14 días previos (misma ventana que
// usa la compuerta de `/cierre` — `ventanaCompuerta`) en dos ejes:
//
//   - error de estimación: |medido − planeado| / planeado, promediado sobre
//     tareas `done` con AMBOS datos (sin plan o sin medición no hay error que
//     calcular, y no se cuentan como cero — inventaría precisión).
//   - minutos de causa `bomberazo`, reusando `getPatronDesvios` (la misma
//     agregación que alimenta /cierre y el AAR semanal — una sola definición
//     de "cuánto bomberazo hubo").
//
// Activa solo si AMBOS suben frente a su ventana anterior: uno solo subiendo
// es ruido normal de la semana, no una espiral.
async function errorEstimacionPromedio(userId: string, desde: Date, hasta: Date): Promise<number | null> {
  const tareas = await prisma.task.findMany({
    where: { userId, estatus: 'done', updatedAt: { gte: desde, lte: hasta } },
    select: { estimadoMin: true, ajustadoMin: true, timeEntries: { select: { seconds: true } } },
  })

  const errores: number[] = []
  for (const t of tareas) {
    const planeado = t.ajustadoMin ?? t.estimadoMin
    if (!planeado || planeado <= 0) continue
    const medido = Math.round(t.timeEntries.reduce((s, e) => s + e.seconds, 0) / 60)
    if (medido <= 0) continue
    errores.push(Math.abs(medido - planeado) / planeado)
  }
  if (errores.length === 0) return null
  return errores.reduce((s, e) => s + e, 0) / errores.length
}

async function minutosBomberazo(userId: string, desde: string, hasta: string): Promise<number> {
  const patron = await getPatronDesvios(userId, desde, hasta)
  return patron.porCausa.find((c) => c.causa === 'bomberazo')?.minutos ?? 0
}

function ventana(hoy: Date, diasAtras: number, largoDias: number) {
  const hasta = new Date(hoy)
  hasta.setUTCDate(hasta.getUTCDate() - diasAtras)
  hasta.setUTCHours(23, 59, 59, 999)
  const desde = new Date(hoy)
  desde.setUTCDate(desde.getUTCDate() - diasAtras - (largoDias - 1))
  desde.setUTCHours(0, 0, 0, 0)
  return { desde, hasta }
}

function errorTexto(v: number | null): string {
  return v === null ? 'sin datos' : `${Math.round(v * 100)}%`
}

async function senalEspiral(userId: string, hoy: Date): Promise<Senal> {
  const p1 = ventana(hoy, 0, 14)
  const p2 = ventana(hoy, 14, 14)

  const [errorP1, errorP2, bomberazoP1, bomberazoP2] = await Promise.all([
    errorEstimacionPromedio(userId, p1.desde, p1.hasta),
    errorEstimacionPromedio(userId, p2.desde, p2.hasta),
    minutosBomberazo(userId, iso(p1.desde), iso(p1.hasta)),
    minutosBomberazo(userId, iso(p2.desde), iso(p2.hasta)),
  ])

  const errorSube = errorP1 !== null && errorP2 !== null && errorP1 > errorP2
  const bomberazoSube = bomberazoP1 > bomberazoP2

  return {
    clave: 'espiral',
    activa: errorSube && bomberazoSube,
    valor: null,
    detalle: `Error de estimación: ${errorTexto(errorP1)} en los últimos 14 días (antes ${errorTexto(errorP2)}). Bomberazos: ${bomberazoP1} min en los últimos 14 días (antes ${bomberazoP2} min).`,
  }
}

// ── Ensamblado ───────────────────────────────────────────────────────────────
export async function senalesSobrecarga(userId: string, hoy: Date): Promise<ResultadoSobrecarga> {
  const senales = await Promise.all([
    senalSobrecompromiso(userId, hoy),
    senalErosionFrontera(userId, hoy),
    senalEspiral(userId, hoy),
  ])

  const activas = senales.filter((s) => s.activa).length
  const nivel: NivelCarga = activas >= 2 ? 'rojo' : activas === 1 ? 'ambar' : 'verde'

  return { nivel, senales }
}
