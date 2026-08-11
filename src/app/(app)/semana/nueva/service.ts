import { prisma } from '@/lib/prisma'
import { isoWeekOf, weekRange } from '@/lib/dates'
import { capacityForWeek, type CapacidadSemana } from '@/app/api/v1/capacity/service'

// Contexto que alimenta los 5 pasos del ritual. Todo se calcula aquí, en el
// servidor: la IA solo redacta y sugiere sobre estos números ya cerrados. Ver
// docs/plans/2026-08-05-planeador-semanal-design.md §Reglas de diseño.

export type WinAnterior = {
  posicion: number
  titulo: string
  estatus: string
  tareasTotal: number
  tareasHechas: number
}

export type RecapAnterior = {
  isoWeek: string
  factorUsado: number
  planMin: number
  realMin: number
  factorLogrado: number | null
  tareasPlaneadas: number
  tareasHechas: number
  tareasConTiempo: number
  // El factor logrado solo significa algo si el cronómetro se usó. Con medición
  // parcial, real/plan mide cuánto se cronometró, no cuánto se tardó: 826 min
  // planeados contra 32 medidos da 0.04, que leído como velocidad es falso.
  medicionIncompleta: boolean
  tareasSinTerminar: string[]
  wins: WinAnterior[]
}

export type PendienteBacklog = {
  id: string
  titulo: string
  proyecto: string | null
  estimadoMin: number | null
  herramienta: string | null
  deadline: string | null
  urgente: boolean
  // 'arrastrada' = venía planeada en una semana anterior y no se terminó. Sin
  // esto el vaciado salía vacío para quien trae trabajo sin cerrar: esas tareas
  // son `planned`, no `backlog`, y el ritual las habría hecho teclear de nuevo.
  origen: 'backlog' | 'arrastrada'
}

export type ContextoPlaneacion = {
  isoWeek: string
  // true solo si la semana ya tiene PLAN (wins o tareas). Un registro de semana
  // vacío no cuenta: Mi Día crea cascarones para colgar juntas sincronizadas, y
  // bloquear por eso dejaba el planeador inservible justo el lunes.
  yaPlaneada: boolean
  factor: number
  anterior: RecapAnterior | null
  backlog: PendienteBacklog[]
  proyectos: Array<{ id: string; nombre: string }>
  capacidad: CapacidadSemana
}

// La semana ISO anterior a la dada. Se resuelve restando 7 días al inicio del
// rango en vez de aritmética sobre el string: "2026-W01" - 1 es "2025-W52" o
// "2025-W53" según el año, y esa tabla no la queremos mantener a mano.
export function isoWeekAnterior(isoWeek: string): string {
  const { inicio } = weekRange(isoWeek)
  const previo = new Date(inicio)
  previo.setUTCDate(previo.getUTCDate() - 7)
  return isoWeekOf(previo)
}

function minutosReales(entries: Array<{ seconds: number }>): number {
  return Math.round(entries.reduce((s, e) => s + e.seconds, 0) / 60)
}

async function recapDe(userId: string, isoWeek: string): Promise<RecapAnterior | null> {
  const week = await prisma.week.findUnique({
    where: { userId_isoWeek: { userId, isoWeek } },
    include: {
      wins: { orderBy: { posicion: 'asc' }, include: { tasks: { select: { estatus: true } } } },
      tasks: { select: { titulo: true, estatus: true, ajustadoMin: true, estimadoMin: true, timeEntries: { select: { seconds: true } } } },
    },
  })
  if (!week) return null

  const planMin = week.tasks.reduce((s, t) => s + (t.ajustadoMin ?? t.estimadoMin ?? 0), 0)
  const realMin = week.tasks.reduce((s, t) => s + minutosReales(t.timeEntries), 0)
  const hechas = week.tasks.filter((t) => t.estatus === 'done')
  const tareasConTiempo = week.tasks.filter((t) => t.timeEntries.length > 0).length

  // Dos señales, porque una sola se escapa: (a) cobertura — qué proporción de lo
  // terminado trae cronómetro; (b) proporción del tiempo — 32 min medidos contra
  // 826 planeados no es velocidad, es que no se cronometró. Cualquiera de las dos
  // vuelve el factor no interpretable. El número se sigue exponiendo, pero marcado.
  const cobertura = hechas.length > 0 ? tareasConTiempo / hechas.length : 0
  const proporcionMedida = planMin > 0 ? realMin / planMin : 0
  const medicionIncompleta = realMin === 0 || cobertura < 0.6 || proporcionMedida < 0.25

  return {
    isoWeek: week.isoWeek,
    factorUsado: Number(week.factorUsado),
    planMin,
    realMin,
    // El factor logrado es real/plan: cuánto más (o menos) tardó de lo estimado.
    // Sin plan no hay razón que reportar — null, no 0, para no fingir precisión.
    factorLogrado: planMin > 0 ? Number((realMin / planMin).toFixed(2)) : null,
    tareasPlaneadas: week.tasks.length,
    tareasHechas: hechas.length,
    tareasConTiempo,
    medicionIncompleta,
    tareasSinTerminar: week.tasks.filter((t) => t.estatus !== 'done' && t.estatus !== 'deferred').map((t) => t.titulo),
    wins: week.wins.map((w) => ({
      posicion: w.posicion,
      titulo: w.titulo,
      estatus: w.estatus,
      tareasTotal: w.tasks.length,
      tareasHechas: w.tasks.filter((t) => t.estatus === 'done').length,
    })),
  }
}

export async function contextoPlaneacion(userId: string, hoy: Date = new Date()): Promise<ContextoPlaneacion> {
  const isoWeek = isoWeekOf(hoy)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })

  const [previa, anterior, backlog, proyectos, capacidad] = await Promise.all([
    prisma.week.findUnique({
      where: { userId_isoWeek: { userId, isoWeek } },
      select: { _count: { select: { wins: true, tasks: true } } },
    }),
    recapDe(userId, isoWeekAnterior(isoWeek)),
    prisma.task.findMany({
      where: {
        userId,
        OR: [
          { estatus: 'backlog' },
          // Trabajo sin cerrar de semanas anteriores: entra al vaciado igual que
          // el backlog. Se excluye la semana en curso para no ofrecer lo que ya
          // está planeado en ella.
          { estatus: { in: ['planned', 'in_progress'] }, week: { isoWeek: { not: isoWeek } } },
        ],
      },
      include: { project: { select: { nombre: true } }, week: { select: { isoWeek: true } } },
      orderBy: [{ urgente: 'desc' }, { deadline: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.project.findMany({ where: { userId, estatus: 'activo' }, select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
    capacityForWeek(userId, isoWeek),
  ])

  return {
    isoWeek,
    yaPlaneada: previa !== null && (previa._count.wins > 0 || previa._count.tasks > 0),
    factor: user.factorManual ? Number(user.factorManual) : 1.4,
    anterior,
    backlog: backlog.map((t) => ({
      id: t.id,
      titulo: t.titulo,
      proyecto: t.project?.nombre ?? null,
      estimadoMin: t.estimadoMin,
      herramienta: t.herramienta,
      deadline: t.deadline ? t.deadline.toISOString().slice(0, 10) : null,
      urgente: t.urgente,
      origen: t.estatus === 'backlog' ? ('backlog' as const) : ('arrastrada' as const),
    })),
    proyectos,
    capacidad,
  }
}

// Carga vs. capacidad. Vive aquí y no en el cliente porque es el único número
// que decide si la semana es realista, y el wizard lo muestra en los pasos 3 y 4.
export type Balance = {
  cargaMin: number
  planeableMin: number
  colchonMin: number
  sobrecargado: boolean
}

export function balance(cargaAjustadaMin: number, capacidad: CapacidadSemana): Balance {
  const planeableMin = Math.round(capacidad.trabajablePlaneable * 60)
  return {
    cargaMin: cargaAjustadaMin,
    planeableMin,
    colchonMin: planeableMin - cargaAjustadaMin,
    sobrecargado: cargaAjustadaMin > planeableMin,
  }
}
