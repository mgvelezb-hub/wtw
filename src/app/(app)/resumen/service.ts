import { prisma } from '@/lib/prisma'
import { weekRange } from '@/lib/dates'

// Ensamblador determinista del resumen. TODO lo que la IA va a leer se arma
// aquí, en el servidor, y queda registrado en `insumos` del Artifact para poder
// auditar después de qué se alimentó cada resumen.
//
// La regla que rige el diseño: el resumen cruza DOS fuentes que hoy viven
// separadas — lo que se dijo (minutas capturadas) y lo que está vivo (tareas,
// issues y entregables abiertos). Un resumen de solo minutas omite los
// compromisos que ya se volvieron trabajo; uno de solo tareas omite el porqué.

export type AlcanceResumen =
  | { tipo: 'junta'; minutaId: string }
  | { tipo: 'periodo'; desde: string; hasta: string; projectId?: string }
  | { tipo: 'dia'; fecha: string }
  | { tipo: 'semana'; isoWeek: string }
  | { tipo: 'proyecto'; projectId: string }
  | { tipo: 'global' }

export type MinutaResumen = {
  id: string
  fecha: string
  titulo: string
  proyecto: string
  asistentes: string[]
  items: Array<{ tipo: string; texto: string; responsable: string | null; fecha: string | null; estado: string }>
}

export type TareaResumen = {
  id: string
  titulo: string
  proyecto: string | null
  estatus: string
  deadline: string | null
  win: string | null
  minutosReales: number
}

export type IssueResumen = { id: string; tipo: string; titulo: string; proyecto: string; estatus: string }

export type EntregableResumen = {
  id: string
  nombre: string
  proyecto: string
  estatus: string
  avancePct: number
  fechaComprometida: string | null
}

export type ContextoResumen = {
  etiqueta: string
  desde: string | null
  hasta: string | null
  minutas: MinutaResumen[]
  tareas: TareaResumen[]
  issues: IssueResumen[]
  entregables: EntregableResumen[]
  // Snapshot de ids para trazabilidad — se guarda en Artifact.insumos.
  insumos: { minutaIds: string[]; taskIds: string[]; issueIds: string[]; entregableIds: string[] }
  vacio: boolean
}

const ESTATUS_VIVOS = ['backlog', 'planned', 'in_progress'] as const

function d(fecha: Date | null): string | null {
  return fecha ? fecha.toISOString().slice(0, 10) : null
}

// Traduce el alcance a una ventana de fechas y, cuando aplica, a un proyecto.
// `desde`/`hasta` en null significa "sin límite temporal" — es el caso de
// proyecto y global, donde lo que importa es qué sigue abierto, no cuándo pasó.
function ventana(alcance: AlcanceResumen): { desde: Date | null; hasta: Date | null; projectId?: string } {
  switch (alcance.tipo) {
    case 'periodo':
      return { desde: new Date(alcance.desde), hasta: new Date(alcance.hasta), projectId: alcance.projectId }
    case 'dia':
      return { desde: new Date(alcance.fecha), hasta: new Date(alcance.fecha) }
    case 'semana': {
      const { inicio, fin } = weekRange(alcance.isoWeek)
      return { desde: inicio, hasta: fin }
    }
    case 'proyecto':
      return { desde: null, hasta: null, projectId: alcance.projectId }
    default:
      return { desde: null, hasta: null }
  }
}

export async function ensamblarResumen(userId: string, alcance: AlcanceResumen): Promise<ContextoResumen> {
  const { desde, hasta, projectId } = ventana(alcance)
  const enRango = desde && hasta ? { gte: desde, lte: hasta } : undefined

  // ── Minutas ────────────────────────────────────────────────────────────
  const minutasRaw = await prisma.minuta.findMany({
    where:
      alcance.tipo === 'junta'
        ? { id: alcance.minutaId, userId }
        : {
            userId,
            ...(projectId ? { projectId } : {}),
            ...(enRango ? { fecha: enRango } : {}),
          },
    include: { project: { select: { nombre: true } }, items: { orderBy: { orden: 'asc' } } },
    orderBy: { fecha: 'asc' },
  })

  const minutas: MinutaResumen[] = minutasRaw.map((m) => ({
    id: m.id,
    fecha: d(m.fecha)!,
    titulo: m.titulo,
    proyecto: m.project.nombre,
    asistentes: m.asistentes,
    items: m.items.map((i) => ({
      tipo: i.tipo,
      texto: i.texto,
      responsable: i.responsable,
      fecha: d(i.fechaCompromiso),
      estado: i.estado,
    })),
  }))

  // Un resumen de UNA junta se queda en esa junta: meter todo el trabajo abierto
  // del proyecto ahogaría lo que realmente pasó en la sesión.
  const soloEsaJunta = alcance.tipo === 'junta'
  const projectIdEfectivo = soloEsaJunta ? minutasRaw[0]?.projectId : projectId

  // ── Trabajo vivo ───────────────────────────────────────────────────────
  // Para día y semana se filtra por el bloque agendado (cuándo se iba a hacer);
  // para lo demás, por lo que sigue abierto sin importar cuándo se planeó.
  const tareasRaw = soloEsaJunta
    ? []
    : await prisma.task.findMany({
        where: {
          userId,
          estatus: { in: [...ESTATUS_VIVOS] },
          ...(projectIdEfectivo ? { projectId: projectIdEfectivo } : {}),
          ...(enRango ? { blocks: { some: { fecha: enRango } } } : {}),
        },
        include: {
          project: { select: { nombre: true } },
          win: { select: { titulo: true } },
          timeEntries: { select: { seconds: true } },
        },
        orderBy: [{ deadline: 'asc' }, { createdAt: 'asc' }],
      })

  const tareas: TareaResumen[] = tareasRaw.map((t) => ({
    id: t.id,
    titulo: t.titulo,
    proyecto: t.project?.nombre ?? null,
    estatus: t.estatus,
    deadline: d(t.deadline),
    win: t.win?.titulo ?? null,
    minutosReales: Math.round(t.timeEntries.reduce((s, e) => s + e.seconds, 0) / 60),
  }))

  // En un alcance con ventana de tiempo y sin proyecto explícito (día, semana,
  // periodo global), los issues y entregables se acotan a los proyectos que
  // aparecen en esa ventana. Traer TODO lo abierto de todos los proyectos
  // ahogaría el resumen de un día en ruido de proyectos que no se tocaron.
  const proyectosEnVentana = [
    ...new Set([...minutasRaw.map((m) => m.projectId), ...tareasRaw.map((t) => t.projectId).filter((x): x is string => x !== null)]),
  ]
  const filtroProyecto = projectIdEfectivo
    ? { id: projectIdEfectivo }
    : enRango
      ? { id: { in: proyectosEnVentana } }
      : {}

  const issuesRaw = soloEsaJunta
    ? []
    : await prisma.issue.findMany({
        where: {
          estatus: 'abierto',
          project: { userId, ...filtroProyecto },
        },
        include: { project: { select: { nombre: true } } },
        orderBy: { createdAt: 'asc' },
      })

  const issues: IssueResumen[] = issuesRaw.map((i) => ({
    id: i.id,
    tipo: i.tipo,
    titulo: i.descripcion,
    proyecto: i.project.nombre,
    estatus: i.estatus,
  }))

  const entregablesRaw = soloEsaJunta
    ? []
    : await prisma.deliverable.findMany({
        where: {
          estatus: { not: 'aceptado' },
          project: { userId, ...filtroProyecto },
        },
        include: { project: { select: { nombre: true } } },
        orderBy: { fechaComprometida: 'asc' },
      })

  const entregables: EntregableResumen[] = entregablesRaw.map((e) => ({
    id: e.id,
    nombre: e.nombre,
    proyecto: e.project.nombre,
    estatus: e.estatus,
    avancePct: e.avancePct,
    fechaComprometida: d(e.fechaComprometida),
  }))

  const etiquetas: Record<AlcanceResumen['tipo'], string> = {
    junta: minutas[0] ? `Junta "${minutas[0].titulo}" — ${minutas[0].fecha}` : 'Junta',
    periodo: `Periodo ${d(desde)} a ${d(hasta)}`,
    dia: `Día ${d(desde)}`,
    semana: `Semana ${alcance.tipo === 'semana' ? alcance.isoWeek : ''}`,
    proyecto: entregables[0]?.proyecto ?? tareas.find((t) => t.proyecto)?.proyecto ?? 'Proyecto',
    global: 'Global — todo lo abierto',
  }

  return {
    etiqueta: etiquetas[alcance.tipo],
    desde: d(desde),
    hasta: d(hasta),
    minutas,
    tareas,
    issues,
    entregables,
    insumos: {
      minutaIds: minutas.map((m) => m.id),
      taskIds: tareas.map((t) => t.id),
      issueIds: issues.map((i) => i.id),
      entregableIds: entregables.map((e) => e.id),
    },
    vacio: minutas.length === 0 && tareas.length === 0 && issues.length === 0 && entregables.length === 0,
  }
}

// Rendering del contexto para el prompt. Se separa del ensamblado para poder
// probar los datos sin depender del formato, y el formato sin tocar la DB.
export function renderContexto(ctx: ContextoResumen): string {
  const bloques: string[] = [`ALCANCE: ${ctx.etiqueta}`]

  if (ctx.minutas.length > 0) {
    bloques.push(
      `\n## MINUTAS CAPTURADAS (${ctx.minutas.length})`,
      ...ctx.minutas.map((m) =>
        [
          `\n### ${m.fecha} — ${m.titulo} (${m.proyecto})`,
          m.asistentes.length > 0 ? `Asistentes: ${m.asistentes.join(', ')}` : '',
          ...m.items.map(
            (i) =>
              `- [${i.tipo}${i.estado !== 'abierto' ? `/${i.estado}` : ''}] ${i.texto}` +
              (i.responsable ? ` — resp: ${i.responsable}` : '') +
              (i.fecha ? ` — fecha: ${i.fecha}` : '')
          ),
        ]
          .filter(Boolean)
          .join('\n')
      )
    )
  }

  if (ctx.tareas.length > 0) {
    bloques.push(
      `\n## TAREAS ABIERTAS (${ctx.tareas.length})`,
      ...ctx.tareas.map(
        (t) =>
          `- ${t.titulo}` +
          (t.proyecto ? ` · ${t.proyecto}` : '') +
          ` · ${t.estatus}` +
          (t.deadline ? ` · deadline ${t.deadline}` : '') +
          (t.win ? ` · Win: ${t.win}` : '') +
          (t.minutosReales > 0 ? ` · ${t.minutosReales} min trabajados` : ' · sin tiempo registrado')
      )
    )
  }

  if (ctx.issues.length > 0) {
    bloques.push(
      `\n## ISSUES ABIERTOS (${ctx.issues.length})`,
      ...ctx.issues.map((i) => `- [${i.tipo}] ${i.titulo} · ${i.proyecto}`)
    )
  }

  if (ctx.entregables.length > 0) {
    bloques.push(
      `\n## ENTREGABLES SIN ACEPTAR (${ctx.entregables.length})`,
      ...ctx.entregables.map(
        (e) =>
          `- ${e.nombre} · ${e.proyecto} · ${e.estatus} · ${e.avancePct}%` +
          (e.fechaComprometida ? ` · comprometido ${e.fechaComprometida}` : '')
      )
    )
  }

  return bloques.join('\n')
}
