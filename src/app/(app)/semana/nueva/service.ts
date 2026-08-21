import type { DesvioCausa } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { isoWeekOf, weekRange } from '@/lib/dates'
import { capacityForWeek, type CapacidadSemana } from '@/app/api/v1/capacity/service'
import { competenciasParaPlaneacion, type CompetenciaPlaneacion } from '@/app/(app)/desarrollo/service'
import { getPatronDesvios } from '@/app/(app)/cierre/service'

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

// Desvíos de la semana que terminó, ya agregados por causa. Es la respuesta a
// "¿por qué la brecha?" del AAR: sin esto el paso 1 muestra que el plan se
// rompió pero no POR QUÉ, y cada causa lleva a un trabajo distinto (cliente,
// código, disciplina). Se lee del mismo cálculo que alimenta /cierre — una sola
// definición de "causa dominante" en toda la app.
export type DesviosSemana = {
  diasReconciliados: number
  totalMin: number
  // Solo las causas con minutos: una lista con tres ceros no informa nada.
  porCausa: Array<{ causa: DesvioCausa; label: string; minutos: number; pct: number; aQuienToca: string }>
  dominante: { causa: DesvioCausa; label: string; minutos: number; pct: number; aQuienToca: string } | null
}

// Veredicto del pre-mortem de la semana pasada: cuántos riesgos se predijeron,
// cuántos ocurrieron y en cuántos la defensa sirvió. Es lo que convierte el
// pre-mortem en una predicción calibrable en vez de un ritual de escritura.
// `cerrados` distingue "no ocurrió" de "la semana no se cerró": WeekRisk.ocurrio
// es null mientras nadie lo evalúa, y contar ese null como "no ocurrió" inflaría
// la puntería.
export type VeredictoPremortem = {
  predichos: number
  cerrados: number
  ocurrieron: number
  defensasSirvieron: number
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
  // Los dos insumos que vuelven el paso 1 un AAR y no un tablero de números:
  // qué rompió el plan, y si lo que se predijo que lo rompería fue lo que pasó.
  desvios: DesviosSemana
  premortem: VeredictoPremortem
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
  // Catálogo para etiquetar qué competencia ejercita cada tarea (paso 3).
  competencias: CompetenciaPlaneacion[]
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

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// Los desvíos del rango de la semana, ya clasificados por causa. Se delega en
// `getPatronDesvios` en vez de reescribir la agregación: /cierre y el AAR tienen
// que decir la MISMA causa dominante, o el paso 1 contradice al panel de 14 días.
async function desviosDe(userId: string, isoWeek: string): Promise<DesviosSemana> {
  const { inicio, fin } = weekRange(isoWeek)
  const patron = await getPatronDesvios(userId, iso(inicio), iso(fin))
  const conMinutos = patron.porCausa.filter((c) => c.minutos > 0)
  return {
    diasReconciliados: patron.diasReconciliados,
    totalMin: patron.totalMin,
    porCausa: conMinutos,
    dominante: patron.dominante ? (conMinutos.find((c) => c.causa === patron.dominante) ?? null) : null,
  }
}

function veredictoDe(riesgos: Array<{ ocurrio: boolean | null; defensaFunciono: boolean | null }>): VeredictoPremortem {
  const cerrados = riesgos.filter((r) => r.ocurrio !== null)
  return {
    predichos: riesgos.length,
    cerrados: cerrados.length,
    ocurrieron: cerrados.filter((r) => r.ocurrio === true).length,
    defensasSirvieron: cerrados.filter((r) => r.defensaFunciono === true).length,
  }
}

async function recapDe(userId: string, isoWeek: string): Promise<RecapAnterior | null> {
  const week = await prisma.week.findUnique({
    where: { userId_isoWeek: { userId, isoWeek } },
    include: {
      wins: { orderBy: { posicion: 'asc' }, include: { tasks: { select: { estatus: true } } } },
      tasks: { select: { titulo: true, estatus: true, ajustadoMin: true, estimadoMin: true, timeEntries: { select: { seconds: true } } } },
      riesgos: { orderBy: { orden: 'asc' }, select: { ocurrio: true, defensaFunciono: true } },
    },
  })
  if (!week) return null

  const desvios = await desviosDe(userId, isoWeek)

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
    desvios,
    premortem: veredictoDe(week.riesgos),
  }
}

export async function contextoPlaneacion(userId: string, hoy: Date = new Date()): Promise<ContextoPlaneacion> {
  const isoWeek = isoWeekOf(hoy)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })

  const [previa, anterior, backlog, proyectos, capacidad, competencias] = await Promise.all([
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
    competenciasParaPlaneacion(userId),
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
    competencias,
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

// ── El buffer deja de ser decorativo ────────────────────────────────────────
//
// `trabajablePlaneable` ya es (trabajable − buffer%): la resta del buffer ocurre
// en capacityForWeek. Lo que faltaba era la CONSECUENCIA — hasta ahora el
// planeador pintaba la sobrecarga en rojo y de todas formas dejaba crear la
// semana, así que el buffer era una cifra en Settings, no una restricción.
//
// La regla: la carga aceptada no puede exceder lo planeable. No es prudencia
// genérica; una semana planeada al 100% no deja margen para lo no previsto y el
// desbordamiento se paga en la semana siguiente (Sonnentag: la recuperación es
// condición del desempeño sostenido, no su recompensa).
export type ValidacionCarga = {
  ok: boolean
  cargaMin: number
  planeableMin: number
  excedenteMin: number
  mensaje: string | null
}

function horasTexto(min: number): string {
  const h = min / 60
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`
}

export function validarCarga(cargaAjustadaMin: number, capacidad: CapacidadSemana): ValidacionCarga {
  const bal = balance(cargaAjustadaMin, capacidad)
  const excedenteMin = Math.max(0, bal.cargaMin - bal.planeableMin)
  return {
    ok: excedenteMin === 0,
    cargaMin: bal.cargaMin,
    planeableMin: bal.planeableMin,
    excedenteMin,
    // Tono de calibración, no de regaño: dice qué pasa y cuánto hay que mover.
    mensaje: mensajeDeCarga(excedenteMin, bal.planeableMin),
  }
}

function mensajeDeCarga(excedenteMin: number, planeableMin: number): string | null {
  if (excedenteMin === 0) return null
  // Sin tiempo planeable, "recorta 12h" es un callejón sin salida: no hay
  // recorte que alcance porque el problema no es la carga, es el calendario.
  // Decir qué palanca sí existe es la diferencia entre una compuerta y un muro.
  if (planeableMin <= 0) {
    return 'Esta semana no tiene tiempo planeable: el calendario la ocupa completa. Libera juntas, o ajusta tu jornada y tu buffer en Settings antes de planear.'
  }
  return `El plan al 100% degrada la capacidad de la semana siguiente — recorta ${horasTexto(excedenteMin)} o muévelas a backlog.`
}

// ── "¿Qué cambias esta semana?" ─────────────────────────────────────────────
//
// La cuarta pregunta del AAR es la única que produce una decisión, y por eso se
// guarda. Va dentro de `Week.reflexion` con una marca en vez de en una columna
// nueva: el recap ya vive ahí, es el mismo texto de la misma semana, y una
// columna extra obligaría a mantener dos campos sincronizados para leerlos
// siempre juntos.
export const MARCA_CAMBIO = 'Qué cambio esta semana:'

export function componerReflexion(recap: string, queCambias: string): string | undefined {
  const base = recap.trim()
  const cambio = queCambias.trim()
  if (cambio === '') return base === '' ? undefined : base
  const linea = `${MARCA_CAMBIO} ${cambio}`
  return base === '' ? linea : `${base}\n\n${linea}`
}

// Inverso de `componerReflexion`, para que reabrir el planeador (o leer la
// semana desde otra vista) no tenga que parsear a ojo.
export function separarReflexion(texto: string | null | undefined): { recap: string; queCambias: string } {
  if (!texto) return { recap: '', queCambias: '' }
  const i = texto.lastIndexOf(MARCA_CAMBIO)
  if (i === -1) return { recap: texto.trim(), queCambias: '' }
  return {
    recap: texto.slice(0, i).trim(),
    queCambias: texto.slice(i + MARCA_CAMBIO.length).trim(),
  }
}
