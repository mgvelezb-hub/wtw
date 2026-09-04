import { prisma } from '@/lib/prisma'
import { cuentaCarga } from '@/lib/delegacion'
import { getWeek } from '@/app/api/v1/weeks/service'
import { capacityForWeek } from '@/app/api/v1/capacity/service'
import { senalesSobrecarga } from '@/lib/carga-sostenible'
import { getHistorico, type HistoricoWeek } from '@/app/(app)/historico/service'
import { weekRangeFull, esFinDeSemana, todayStr } from '@/lib/dates'
import { toMin, etiquetaHora, posicionarBloque, repartirCarriles, type Ubicacion } from './lienzo'

// ── Objetos planos al cliente (regla 2) ──────────────────────────────────────

export type LienzoBloque = {
  id: string
  fecha: string // AAAA-MM-DD
  inicio: string
  fin: string
  titulo: string
  tipo: string
  planMin: number
  taskId: string | null
  /** Junta de Outlook: no se arrastra, no se reposiciona, se pinta en gris. */
  externa: boolean
  /** Solo significativo en externas: false = junta informativa que no resta
      capacidad ni estorba — se pinta atenuada y las tareas pueden taparla. */
  bloqueante: boolean
  done: boolean
  proyecto: { nombre: string; color: string } | null
  ubicacion: Ubicacion
  topMin: number | null
  durMin: number
  /** Columna dentro del grupo de traslape (0 = la de la izquierda). */
  carril: number
  /** Cuántas columnas tiene su grupo. 1 = el bloque ocupa el ancho completo. */
  carriles: number
}

export type LienzoDia = {
  fecha: string
  abr: string
  num: number
  esHoy: boolean
  /** Minutos comprometidos ese día: bloques + juntas de Outlook bloqueantes. */
  planeadoMin: number
  /** Jornada del día (horario − comida), con DayOverride aplicado. */
  jornadaMin: number
  /** planeado / jornada, en %. >100 = el día ya no cabe en sí mismo. */
  pct: number
  /** Sábado o domingo. La columna solo existe si hay trabajo ahí. */
  finDeSemana: boolean
  /** Fin de semana sin horario declarado: no hay rejilla de horas que respetar. */
  sinJornada: boolean
}

export type BandejaItem = {
  id: string
  titulo: string
  estimadoMin: number | null
  urgente: boolean
  proyecto: string | null
  color: string | null
}

export type WinView = {
  id: string
  posicion: number
  titulo: string
  dod: string | null
  siEntonces: string | null
  estatus: string
  /** Ningún bloque de la semana apunta a este Win: es una intención sin tiempo. */
  sinBloques: boolean
}

export type FueraDeJornadaItem = {
  blockId: string
  abr: string
  fecha: string
  rango: string
  titulo: string
}

export type LienzoSemana = {
  isoWeek: string
  numeroSemana: number
  rango: string
  dias: LienzoDia[]
  /** El día que abre el toggle "Día": hoy si cae en la semana, si no el lunes. */
  diaSeleccionado: string
  jornadaInicioMin: number
  jornadaFinMin: number
  horas: string[]
  bloques: LienzoBloque[]
  fueraDeJornada: FueraDeJornadaItem[]
  /** % de minutos cronometrados fuera de jornada en 14 días. null si no hay señal. */
  fueraPct: number | null
  bandeja: BandejaItem[]
  wins: WinView[]
  cargaHoras: number
  trabajableTotal: number
  trabajablePlaneable: number
  bufferPct: number
  /** Semáforo de carga sostenible, plano — solo las señales ACTIVAS. */
  sobrecarga: { nivel: string; senales: string[] }
  tendencias: HistoricoWeek[]
}

const ABR = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MES_ABR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function getLienzoSemana(
  userId: string,
  isoWeek: string,
  hoy: string = todayStr()
): Promise<LienzoSemana | null> {
  const { inicio, fin } = weekRangeFull(isoWeek)

  const [week, user, blocksRaw, eventos, overrides, pendientes, capacidad, sobrecarga, tendencias] = await Promise.all([
    getWeek(userId, isoWeek),
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { horarioInicio: true, horarioFin: true, comidaInicio: true, comidaFin: true, bufferPct: true },
    }),
    prisma.block.findMany({
      // Doble candado de propiedad: la semana tiene que ser del usuario. Un
      // bloque de otro usuario con la misma fecha no entra al lienzo.
      where: { week: { userId }, fecha: { gte: inicio, lte: fin } },
      include: {
        task: { select: { id: true, winId: true, estatus: true, delegadoA: true, project: { select: { nombre: true, color: true } } } },
      },
      orderBy: [{ fecha: 'asc' }, { orden: 'asc' }],
    }),
    prisma.calendarEvent.findMany({
      where: { userId, fecha: { gte: inicio, lte: fin }, cancelado: false },
    }),
    prisma.dayOverride.findMany({ where: { userId, fecha: { gte: inicio, lte: fin } } }),
    prisma.task.findMany({
      // Misma forma que los pendientes de /dia (dia/service.getDiaView):
      // backlog del usuario, urgentes arriba. La bandeja del lienzo y el panel
      // de pendientes de Mi Día muestran exactamente el mismo conjunto.
      where: { userId, estatus: 'backlog' },
      include: { project: { select: { nombre: true, color: true } } },
      orderBy: [{ urgente: 'desc' }, { createdAt: 'desc' }],
    }),
    capacityForWeek(userId, isoWeek),
    senalesSobrecarga(userId, new Date(hoy)),
    getHistorico(userId),
  ])

  if (!week) return null

  const jornadaInicioMin = toMin(user.horarioInicio)
  const jornadaFinMin = toMin(user.horarioFin)
  const comidaMin = Math.max(0, toMin(user.comidaFin) - toMin(user.comidaInicio))

  const horas: string[] = []
  for (let m = jornadaInicioMin; m < jornadaFinMin; m += 60) horas.push(etiquetaHora(m))

  const overridePorFecha = new Map(overrides.map((o) => [iso(o.fecha), o]))

  // Un día de fin de semana no tiene jornada, así que cualquier hora en él es
  // fuera de jornada — la misma regla que usa `carga-sostenible.fueraDeJornada`
  // para la señal de erosión de frontera. La excepción es un DayOverride que
  // DECLARA horario: si Mau dijo que ese sábado trabaja, el bloque se pinta en
  // el grid como cualquier otro y no cuenta como erosión.
  function sinJornada(fecha: string): boolean {
    if (!esFinDeSemana(fecha)) return false
    return !overridePorFecha.get(fecha)?.inicio
  }

  const bloques: LienzoBloque[] = blocksRaw.map((b) => {
    const pos = posicionarBloque(b.inicio, b.fin, b.planMin, jornadaInicioMin, jornadaFinMin, sinJornada(iso(b.fecha)))
    return {
      id: b.id,
      fecha: iso(b.fecha),
      inicio: b.inicio,
      fin: b.fin,
      titulo: b.titulo,
      tipo: b.tipo,
      planMin: b.planMin,
      taskId: b.taskId,
      externa: false,
      bloqueante: true,
      done: b.done,
      proyecto: b.task?.project ? { nombre: b.task.project.nombre, color: b.task.project.color } : null,
      carril: 0,
      carriles: 1,
      ...pos,
    }
  })

  for (const e of eventos) {
    const durMin = Math.max(0, toMin(e.fin) - toMin(e.inicio))
    const pos = posicionarBloque(e.inicio, e.fin, durMin, jornadaInicioMin, jornadaFinMin, sinJornada(iso(e.fecha)))
    bloques.push({
      id: `cal-${e.id}`,
      fecha: iso(e.fecha),
      inicio: e.inicio,
      fin: e.fin,
      titulo: e.titulo,
      tipo: 'externa',
      planMin: durMin,
      taskId: null,
      externa: true,
      bloqueante: e.bloqueante,
      done: false,
      proyecto: null,
      carril: 0,
      carriles: 1,
      ...pos,
    })
  }

  // Fechas con algo registrado: lo que decide si la columna de sábado o domingo
  // aparece. Un fin de semana limpio no ensancha el lienzo con dos columnas
  // vacías; uno trabajado no se puede esconder.
  const conTrabajo = new Set<string>([
    ...blocksRaw.map((b) => iso(b.fecha)),
    ...eventos.map((e) => iso(e.fecha)),
    ...overrides.filter((o) => o.inicio).map((o) => iso(o.fecha)),
  ])

  // Los que se dibujan en el grid reparten ancho por día: dos bloques que
  // comparten hora van lado a lado en vez de apilarse e imprimir texto sobre
  // texto. Se calcula DESPUÉS de unir juntas y tareas, porque una junta de
  // Outlook encimada con trabajo es una colisión igual de real.
  const enGridPorFecha = new Map<string, LienzoBloque[]>()
  for (const b of bloques) {
    if (b.ubicacion !== 'grid' || b.topMin === null) continue
    const lista = enGridPorFecha.get(b.fecha)
    if (lista) lista.push(b)
    else enGridPorFecha.set(b.fecha, [b])
  }
  for (const lista of enGridPorFecha.values()) {
    const carriles = repartirCarriles(lista.map((b) => ({ id: b.id, topMin: b.topMin!, durMin: b.durMin })))
    for (const b of lista) {
      const c = carriles.get(b.id)
      if (!c) continue
      b.carril = c.carril
      b.carriles = c.carriles
    }
  }

  const dias: LienzoDia[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(inicio)
    d.setUTCDate(d.getUTCDate() + i)
    const fecha = iso(d)
    if (i >= 5 && !conTrabajo.has(fecha)) continue
    const ov = overridePorFecha.get(fecha)

    // Día bloqueado por override sin horario (festivo, viaje): jornada 0 — el
    // meter se pinta lleno en cuanto haya un solo minuto planeado ahí.
    const jornadaMin =
      (ov && !ov.inicio) || sinJornada(fecha)
        ? 0
        : Math.max(0, toMin(ov?.fin ?? user.horarioFin) - toMin(ov?.inicio ?? user.horarioInicio) - comidaMin)

    const planeadoMin =
      blocksRaw.filter((b) => iso(b.fecha) === fecha && cuentaCarga(b)).reduce((s, b) => s + b.planMin, 0) +
      eventos
        .filter((e) => iso(e.fecha) === fecha && e.bloqueante)
        .reduce((s, e) => s + Math.max(0, toMin(e.fin) - toMin(e.inicio)), 0)

    dias.push({
      fecha,
      abr: ABR[i],
      num: d.getUTCDate(),
      esHoy: fecha === hoy,
      planeadoMin,
      jornadaMin,
      pct: jornadaMin > 0 ? (planeadoMin / jornadaMin) * 100 : planeadoMin > 0 ? 100 : 0,
      finDeSemana: esFinDeSemana(fecha),
      sinJornada: sinJornada(fecha),
    })
  }

  const abrPorFecha = new Map(dias.map((d) => [d.fecha, d.abr]))
  const fueraDeJornada: FueraDeJornadaItem[] = bloques
    .filter((b) => b.ubicacion === 'fuera')
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.inicio.localeCompare(b.inicio))
    .map((b) => ({
      blockId: b.id,
      abr: abrPorFecha.get(b.fecha) ?? b.fecha,
      fecha: b.fecha,
      rango: `${b.inicio} – ${b.fin}`,
      titulo: b.titulo,
    }))

  const erosion = sobrecarga.senales.find((s) => s.clave === 'erosion_frontera')

  const winsConBloques = new Set(blocksRaw.map((b) => b.task?.winId).filter((id): id is string => !!id))

  const cargaMin = week.tasks.reduce((s, t) => s + (t.ajustadoMin ?? t.estimadoMin ?? 0), 0)

  // El rango se lee del último día VISIBLE, no del domingo del calendario: una
  // semana sin trabajo de fin de semana sigue diciendo "6 – 10 Jul".
  const finDate = new Date(`${dias[dias.length - 1].fecha}T00:00:00Z`)
  const rango = `${inicio.getUTCDate()} – ${finDate.getUTCDate()} ${MES_ABR[finDate.getUTCMonth()]}`

  return {
    isoWeek,
    numeroSemana: Number(isoWeek.split('-W')[1]),
    rango,
    dias,
    diaSeleccionado: dias.find((d) => d.esHoy)?.fecha ?? dias[0].fecha,
    jornadaInicioMin,
    jornadaFinMin,
    horas,
    bloques,
    fueraDeJornada,
    fueraPct: erosion?.valor ?? null,
    bandeja: pendientes.map((t) => ({
      id: t.id,
      titulo: t.titulo,
      estimadoMin: t.estimadoMin,
      urgente: t.urgente,
      proyecto: t.project?.nombre ?? null,
      color: t.project?.color ?? null,
    })),
    wins: week.wins.map((w) => ({
      id: w.id,
      posicion: w.posicion,
      titulo: w.titulo,
      dod: w.dod,
      siEntonces: w.siEntonces,
      estatus: w.estatus,
      sinBloques: !winsConBloques.has(w.id),
    })),
    cargaHoras: cargaMin / 60,
    trabajableTotal: capacidad.trabajableTotal,
    trabajablePlaneable: capacidad.trabajablePlaneable,
    bufferPct: user.bufferPct,
    sobrecarga: {
      nivel: sobrecarga.nivel,
      senales: sobrecarga.senales.filter((sen) => sen.activa).map((sen) => sen.detalle),
    },
    tendencias,
  }
}

// Se conserva porque `tests/planeador-aar.test.ts` verifica aquí que el
// si-entonces de cada Win sobrevive hasta la vista de la semana.
export async function getWeekView(userId: string, isoWeek: string) {
  const [week, capacidad, sobrecarga] = await Promise.all([
    getWeek(userId, isoWeek),
    capacityForWeek(userId, isoWeek),
    senalesSobrecarga(userId, new Date()),
  ])
  if (!week) return null
  const cargaMin = week.tasks.reduce((s, t) => s + (t.ajustadoMin ?? t.estimadoMin ?? 0), 0)
  return { week, capacidad, cargaHoras: cargaMin / 60, sobrecarga }
}
