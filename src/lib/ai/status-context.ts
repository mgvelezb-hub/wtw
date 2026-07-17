import { prisma } from '@/lib/prisma'

// Ensamblador determinista de insumos para el status de proyecto (SQL puro,
// sin LLM). Ver docs/plans/2026-07-16-fase7-pmo-ia-design.md §4. El objeto
// devuelto es plano y serializable (fechas como ISO strings) — se guarda tal
// cual en Artifact.insumos para trazabilidad.

const VENTANA_SIN_STATUS_PREVIO_DIAS = 14

export type StatusContextDodItem = {
  id: string
  texto: string
}

export type StatusContextAvance = {
  id: string
  titulo: string
  updatedAt: string
  dodItems: StatusContextDodItem[]
}

export type StatusContextBloque = {
  fecha: string
  inicio: string
  fin: string
}

export type StatusContextEnCurso = {
  id: string
  titulo: string
  estatus: string
  bloques: StatusContextBloque[]
}

export type StatusContextMinutaItem = {
  id: string
  tipo: string
  texto: string
  responsable: string | null
  fechaCompromiso: string | null
  estado: string
}

export type StatusContextMinuta = {
  id: string
  fecha: string
  titulo: string
  asistentes: string[]
  items: StatusContextMinutaItem[]
}

export type StatusContextIssue = {
  id: string
  tipo: string
  tema: string | null
  descripcion: string
  responsable: string | null
  fechaCompromiso: string | null
  ultimoSeguimiento: string | null
  numSeguimientos: number
  createdAt: string
}

export type StatusContextEntregable = {
  id: string
  nombre: string
  numeroSow: string | null
  estatus: string
  fechaComprometida: string | null
  fechaProyectada: string | null
  avancePct: number
}

export type StatusContext = {
  rangoDesde: string
  statusAnterior: string | null
  avances: StatusContextAvance[]
  enCurso: StatusContextEnCurso[]
  minutasNuevas: StatusContextMinuta[]
  esperas: StatusContextIssue[]
  entregables: StatusContextEntregable[]
  whitelist: string[]
}

async function assertProjectOwnership(userId: string, projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project || project.userId !== userId) throw new Error('proyecto no encontrado')
  return project
}

function dedupeNombres(nombres: Array<string | null | undefined>): string[] {
  const vistos = new Set<string>()
  const resultado: string[] = []
  for (const nombre of nombres) {
    const limpio = nombre?.trim()
    if (!limpio) continue
    if (vistos.has(limpio)) continue
    vistos.add(limpio)
    resultado.push(limpio)
  }
  return resultado
}

export async function buildStatusContext(userId: string, projectId: string): Promise<StatusContext> {
  const project = await assertProjectOwnership(userId, projectId)
  const user = await prisma.user.findUnique({ where: { id: userId } })

  // 1. Último status: define rangoDesde y statusAnterior.
  const ultimoStatus = await prisma.artifact.findFirst({
    where: { projectId, tipo: 'status_equipo', estado: { in: ['editado', 'enviado'] } },
    orderBy: { createdAt: 'desc' },
  })

  const rangoDesde = ultimoStatus
    ? ultimoStatus.createdAt
    : new Date(Date.now() - VENTANA_SIN_STATUS_PREVIO_DIAS * 24 * 60 * 60 * 1000)
  const statusAnterior = ultimoStatus?.final ?? null

  // 2. Avances: Tasks done actualizadas desde rangoDesde, con sus DodItems cumplidos.
  const tareasAvance = await prisma.task.findMany({
    where: { projectId, estatus: 'done', updatedAt: { gte: rangoDesde } },
    include: { dodItems: { where: { done: true }, orderBy: { orden: 'asc' } } },
    orderBy: { updatedAt: 'desc' },
  })

  const avances: StatusContextAvance[] = tareasAvance.map((tarea) => ({
    id: tarea.id,
    titulo: tarea.titulo,
    updatedAt: tarea.updatedAt.toISOString(),
    dodItems: tarea.dodItems.map((dod) => ({ id: dod.id, texto: dod.texto })),
  }))

  // 3. En curso / planeado: Tasks in_progress + planned de la semana ACTIVA del
  // usuario, con sus bloques agendados. Sin semana activa: lista vacía.
  const semanaActiva = await prisma.week.findFirst({ where: { userId, estatus: 'active' } })

  let enCurso: StatusContextEnCurso[] = []
  if (semanaActiva) {
    const tareasEnCurso = await prisma.task.findMany({
      where: { projectId, weekId: semanaActiva.id, estatus: { in: ['in_progress', 'planned'] } },
      include: { blocks: { orderBy: [{ fecha: 'asc' }, { orden: 'asc' }] } },
      orderBy: { updatedAt: 'desc' },
    })

    enCurso = tareasEnCurso.map((tarea) => ({
      id: tarea.id,
      titulo: tarea.titulo,
      estatus: tarea.estatus,
      bloques: tarea.blocks.map((bloque) => ({
        fecha: bloque.fecha.toISOString(),
        inicio: bloque.inicio,
        fin: bloque.fin,
      })),
    }))
  }

  // 4. Minutas nuevas desde rangoDesde, con TODOS sus items (convertidos incluidos).
  const minutas = await prisma.minuta.findMany({
    where: { projectId, fecha: { gte: rangoDesde } },
    include: { items: { orderBy: { orden: 'asc' } } },
    orderBy: { fecha: 'desc' },
  })

  const minutasNuevas: StatusContextMinuta[] = minutas.map((minuta) => ({
    id: minuta.id,
    fecha: minuta.fecha.toISOString(),
    titulo: minuta.titulo,
    asistentes: minuta.asistentes,
    items: minuta.items.map((item) => ({
      id: item.id,
      tipo: item.tipo,
      texto: item.texto,
      responsable: item.responsable,
      fechaCompromiso: item.fechaCompromiso ? item.fechaCompromiso.toISOString() : null,
      estado: item.estado,
    })),
  }))

  // 5. Esperas / RAID abierto.
  const issuesAbiertos = await prisma.issue.findMany({
    where: { projectId, estatus: 'abierto' },
    orderBy: { createdAt: 'desc' },
  })

  const esperas: StatusContextIssue[] = issuesAbiertos.map((issue) => ({
    id: issue.id,
    tipo: issue.tipo,
    tema: issue.tema,
    descripcion: issue.descripcion,
    responsable: issue.responsable,
    fechaCompromiso: issue.fechaCompromiso ? issue.fechaCompromiso.toISOString() : null,
    ultimoSeguimiento: issue.ultimoSeguimiento ? issue.ultimoSeguimiento.toISOString() : null,
    numSeguimientos: issue.numSeguimientos,
    createdAt: issue.createdAt.toISOString(),
  }))

  // 6. Entregables.
  const deliverables = await prisma.deliverable.findMany({ where: { projectId } })

  const entregables: StatusContextEntregable[] = deliverables.map((deliverable) => ({
    id: deliverable.id,
    nombre: deliverable.nombre,
    numeroSow: deliverable.numeroSow,
    estatus: deliverable.estatus,
    fechaComprometida: deliverable.fechaComprometida ? deliverable.fechaComprometida.toISOString() : null,
    fechaProyectada: deliverable.fechaProyectada ? deliverable.fechaProyectada.toISOString() : null,
    avancePct: deliverable.avancePct,
  }))

  // 7. Whitelist: agregación pura de nombres presentes en los campos de arriba —
  // nunca heurísticas sobre texto libre.
  const whitelist = dedupeNombres([
    user?.nombre,
    project.nombre,
    project.cliente,
    ...esperas.map((issue) => issue.responsable),
    ...minutasNuevas.flatMap((minuta) => minuta.asistentes),
    ...minutasNuevas.flatMap((minuta) => minuta.items.map((item) => item.responsable)),
  ])

  return {
    rangoDesde: rangoDesde.toISOString(),
    statusAnterior,
    avances,
    enCurso,
    minutasNuevas,
    esperas,
    entregables,
    whitelist,
  }
}
