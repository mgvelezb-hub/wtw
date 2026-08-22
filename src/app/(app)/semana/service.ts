import { prisma } from '@/lib/prisma'
import { getWeek } from '@/app/api/v1/weeks/service'
import { capacityForWeek } from '@/app/api/v1/capacity/service'
import { senalesSobrecarga } from '@/lib/carga-sostenible'
import { getHistorico, type HistoricoWeek } from '@/app/(app)/historico/service'
import { weekRange, todayStr } from '@/lib/dates'
import { toMin, etiquetaHora, posicionarBloque, type Ubicacion } from './lienzo'

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
  done: boolean
  proyecto: { nombre: string; color: string } | null
  ubicacion: Ubicacion
  topMin: number | null
  durMin: number
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

const ABR = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie']
const MES_ABR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// El % de erosión de frontera ya lo calcula `senalesSobrecarga` y lo deja
// dentro del detalle en prosa ("52% de los minutos cronometrados..."). Se
// extrae en vez de recalcularlo: dos definiciones de "fuera de jornada" que
// se salgan de sincronía es peor que este parseo.
function pctErosion(detalle: string): number | null {
  const m = detalle.match(/(\d+)%/)
  return m ? Number(m[1]) : null
}

export async function getLienzoSemana(
  userId: string,
  isoWeek: string,
  hoy: string = todayStr()
): Promise<LienzoSemana | null> {
  const { inicio, fin } = weekRange(isoWeek)

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
      include: { task: { select: { id: true, winId: true, project: { select: { nombre: true, color: true } } } } },
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

  const bloques: LienzoBloque[] = blocksRaw.map((b) => {
    const pos = posicionarBloque(b.inicio, b.fin, b.planMin, jornadaInicioMin, jornadaFinMin)
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
      done: b.done,
      proyecto: b.task?.project ? { nombre: b.task.project.nombre, color: b.task.project.color } : null,
      ...pos,
    }
  })

  for (const e of eventos) {
    const durMin = Math.max(0, toMin(e.fin) - toMin(e.inicio))
    const pos = posicionarBloque(e.inicio, e.fin, durMin, jornadaInicioMin, jornadaFinMin)
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
      done: false,
      proyecto: null,
      ...pos,
    })
  }

  const overridePorFecha = new Map(overrides.map((o) => [iso(o.fecha), o]))
  const dias: LienzoDia[] = []
  for (let i = 0; i < 5; i++) {
    const d = new Date(inicio)
    d.setUTCDate(d.getUTCDate() + i)
    const fecha = iso(d)
    const ov = overridePorFecha.get(fecha)

    // Día bloqueado por override sin horario (festivo, viaje): jornada 0 — el
    // meter se pinta lleno en cuanto haya un solo minuto planeado ahí.
    const jornadaMin =
      ov && !ov.inicio
        ? 0
        : Math.max(0, toMin(ov?.fin ?? user.horarioFin) - toMin(ov?.inicio ?? user.horarioInicio) - comidaMin)

    const planeadoMin =
      blocksRaw.filter((b) => iso(b.fecha) === fecha).reduce((s, b) => s + b.planMin, 0) +
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

  const finDate = new Date(fin)
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
    fueraPct: erosion ? pctErosion(erosion.detalle) : null,
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
