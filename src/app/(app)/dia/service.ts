import { prisma } from '@/lib/prisma'
import { runningEntry, stopTimer } from '@/app/api/v1/timer/service'
import { getWeek } from '@/app/api/v1/weeks/service'
import { capacityForWeek } from '@/app/api/v1/capacity/service'

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export type DayBlockView = {
  id: string
  inicio: string
  fin: string
  tipo: string // tarea | junta | hito | descanso | externa
  titulo: string
  planMin: number
  taskId: string | null
  done: boolean
  dodItems: { id: string; texto: string; done: boolean }[]
  accumulatedSeconds: number
  runningSince: string | null
  externa: boolean // junta de Outlook: fija, sin cronómetro
  proyecto: { nombre: string; color: string; tipo: string } | null
  winPosicion: number | null
  aliado: boolean // agrega valor al cliente fuera de SOW
  gerente: boolean // aporta a competencias del escalafón
  fueraDeJornada: boolean // el reflow de juntas lo empujó después de horarioFin
  bloqueante: boolean // false: junta informativa (ej. compartida solo para visibilidad) — no resta capacidad
  calendarEventId: string | null // id crudo (sin prefijo) del CalendarEvent — para crear/buscar su Minuta
  proyectoId: string | null // proyecto resuelto vía task.project — null si hay que preguntarlo en el drawer
  minutaId: string | null // Minuta ya capturada para esta junta, si existe
}

export async function getDayBlocks(userId: string, dateStr: string): Promise<DayBlockView[]> {
  const [blocks, running, eventos, user] = await Promise.all([
    prisma.block.findMany({
      where: { fecha: new Date(dateStr), week: { userId } },
      include: {
        task: {
          include: {
            dodItems: { orderBy: { orden: 'asc' } },
            timeEntries: true,
            project: true,
            win: true,
            competencias: { select: { id: true } },
          },
        },
      },
      orderBy: { orden: 'asc' },
    }),
    runningEntry(userId),
    prisma.calendarEvent.findMany({ where: { userId, fecha: new Date(dateStr) } }), // incluye canceladas: se muestran tachadas
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { horarioFin: true, horarioInicio: true } }),
  ])
  const jornadaFin = toMin(user.horarioFin)
  const jornadaInicio = toMin(user.horarioInicio)

  // Minutas ya capturadas hoy para juntas candidatas — bloques tipo junta y
  // CalendarEvents bloqueantes. Una sola consulta para todo el día en vez de
  // una por bloque (§6 Tarea 6 del plan de fase 7).
  const juntaBlockIds = blocks.filter((b) => b.tipo === 'junta').map((b) => b.id)
  const juntaEventIds = eventos.filter((e) => e.bloqueante).map((e) => e.id)
  const minutasHoy =
    juntaBlockIds.length || juntaEventIds.length
      ? await prisma.minuta.findMany({
          where: {
            OR: [
              ...(juntaBlockIds.length ? [{ blockId: { in: juntaBlockIds } }] : []),
              ...(juntaEventIds.length ? [{ calendarEventId: { in: juntaEventIds } }] : []),
            ],
          },
          select: { id: true, blockId: true, calendarEventId: true },
        })
      : []
  const minutaPorBlock = new Map(minutasHoy.filter((m) => m.blockId).map((m) => [m.blockId as string, m.id]))
  const minutaPorEvento = new Map(minutasHoy.filter((m) => m.calendarEventId).map((m) => [m.calendarEventId as string, m.id]))

  const taskBlocks: DayBlockView[] = blocks.map((b) => {
    const task = b.task
    const accumulatedSeconds = task
      ? task.timeEntries.filter((e) => e.stoppedAt !== null).reduce((sum, e) => sum + e.seconds, 0)
      : 0
    const isRunning = !!task && running?.taskId === task.id
    return {
      id: b.id,
      inicio: b.inicio,
      fin: b.fin,
      tipo: b.tipo,
      titulo: b.titulo,
      planMin: b.planMin,
      taskId: b.taskId,
      done: task ? task.estatus === 'done' : b.done,
      dodItems: task ? task.dodItems.map((d) => ({ id: d.id, texto: d.texto, done: d.done })) : [],
      accumulatedSeconds,
      runningSince: isRunning ? running!.startedAt.toISOString() : null,
      externa: false,
      proyecto: task?.project
        ? { nombre: task.project.nombre, color: task.project.color, tipo: task.project.tipo }
        : null,
      winPosicion: task?.win ? task.win.posicion : null,
      aliado: task?.alcance === 'aliado',
      gerente: (task?.competencias?.length ?? 0) > 0,
      fueraDeJornada:
        b.tipo === 'tarea' &&
        b.inicio !== 'flex' &&
        (toMin(b.fin) > jornadaFin || toMin(b.inicio) < jornadaInicio),
      bloqueante: true,
      calendarEventId: null,
      proyectoId: task?.project?.id ?? null,
      minutaId: b.tipo === 'junta' ? (minutaPorBlock.get(b.id) ?? null) : null,
    }
  })

  // Juntas de Outlook como bloques fijos (sin cronómetro, no arrastrables)
  const eventBlocks: DayBlockView[] = eventos.map((e) => ({
    id: `cal-${e.id}`,
    inicio: e.inicio,
    fin: e.fin,
    tipo: 'externa',
    titulo: e.titulo,
    planMin: Math.max(0, toMin(e.fin) - toMin(e.inicio)),
    taskId: null,
    done: e.cancelado,
    dodItems: [],
    accumulatedSeconds: 0,
    runningSince: null,
    externa: true,
    proyecto: null,
    winPosicion: null,
    aliado: false,
    gerente: false,
    fueraDeJornada: false,
    bloqueante: e.bloqueante,
    calendarEventId: e.id,
    proyectoId: null,
    minutaId: e.bloqueante ? (minutaPorEvento.get(e.id) ?? null) : null,
  }))

  return [...taskBlocks, ...eventBlocks].sort((a, b) => a.inicio.localeCompare(b.inicio))
}

export type PendienteView = {
  id: string
  titulo: string
  estimadoMin: number | null
  urgente: boolean
  proyecto: string | null
}

export type StrandedBlockView = { id: string; titulo: string; fecha: string; planMin: number }

// Bloques de tarea de días YA PASADOS que nunca se marcaron como hechos — el
// mecanismo de "carry" del tablero original (getPendingFromPastDays). Sin esto,
// una tarea agendada ayer que no se terminó queda congelada: no es "hoy" así
// que no se puede iniciar su cronómetro, y tampoco aparece en pendientes porque
// ya tiene bloque asignado.
export async function getStrandedBlocks(userId: string, todayStr: string): Promise<StrandedBlockView[]> {
  const blocks = await prisma.block.findMany({
    where: {
      week: { userId },
      fecha: { lt: new Date(todayStr) },
      tipo: 'tarea',
      task: { estatus: { in: ['planned', 'in_progress'] } },
    },
    include: { task: true },
    orderBy: { fecha: 'asc' },
  })
  return blocks.map((b) => ({
    id: b.id,
    titulo: b.titulo,
    fecha: b.fecha.toISOString().slice(0, 10),
    planMin: b.planMin,
  }))
}

export type ProyectoActivoView = { id: string; nombre: string; color: string }

// Proyectos activos del usuario, planos — para el select del drawer de minuta
// cuando la junta no trae un proyecto resoluble (junta suelta o CalendarEvent).
export async function getProyectosActivos(userId: string): Promise<ProyectoActivoView[]> {
  return prisma.project.findMany({
    where: { userId, estatus: 'activo' },
    orderBy: { nombre: 'asc' },
    select: { id: true, nombre: true, color: true },
  })
}

export async function getDiaView(userId: string, isoWeek: string, dateStr: string, todayStr: string) {
  const [week, capacidad, blocks, pendientesRaw, stranded, proyectosActivos] = await Promise.all([
    getWeek(userId, isoWeek),
    capacityForWeek(userId, isoWeek),
    getDayBlocks(userId, dateStr),
    prisma.task.findMany({
      where: { userId, estatus: 'backlog' },
      include: { project: true },
      orderBy: [{ urgente: 'desc' }, { createdAt: 'desc' }],
    }),
    dateStr === todayStr ? getStrandedBlocks(userId, todayStr) : Promise.resolve([]),
    getProyectosActivos(userId),
  ])

  const planeadoMin = blocks.filter((b) => b.tipo === 'tarea').reduce((s, b) => s + b.planMin, 0)
  const realMin = blocks.reduce((s, b) => s + b.accumulatedSeconds, 0) / 60
  const factorDia = planeadoMin > 0 && realMin > 0 ? realMin / planeadoMin : null

  const diaCap = capacidad.dias.find((d) => d.fecha === dateStr)
  const libresHoy = diaCap ? diaCap.horasLibres : 0
  const capacidadHoy = libresHoy - planeadoMin / 60

  const cargaSemMin = week?.tasks.reduce((s, t) => s + (t.ajustadoMin ?? t.estimadoMin ?? 0), 0) ?? 0

  const pendientes: PendienteView[] = pendientesRaw.map((t) => ({
    id: t.id,
    titulo: t.titulo,
    estimadoMin: t.estimadoMin,
    urgente: t.urgente,
    proyecto: t.project?.nombre ?? null,
  }))

  return {
    week,
    capacidad,
    cargaSemHoras: cargaSemMin / 60,
    blocks,
    planeadoMin,
    realMin,
    factorDia,
    libresHoy,
    capacidadHoy,
    pendientes,
    stranded,
    proyectosActivos,
  }
}

async function assertOwnedTask(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { timeEntries: true } })
  if (!task || task.userId !== userId) throw new Error('task no encontrada')
  return task
}

async function assertOwnedBlock(blockId: string, userId: string) {
  const block = await prisma.block.findUnique({ where: { id: blockId }, include: { week: true } })
  if (!block || block.week.userId !== userId) throw new Error('block no encontrado')
  if (block.tipo === 'tarea') throw new Error('bloques tipo tarea se marcan vía markTaskDone')
  return block
}

export async function toggleDodItem(dodItemId: string, userId: string) {
  const item = await prisma.dodItem.findUnique({ where: { id: dodItemId }, include: { task: true } })
  if (!item || item.task.userId !== userId) throw new Error('dodItem no encontrado')
  return prisma.dodItem.update({ where: { id: dodItemId }, data: { done: !item.done } })
}

// Descarta un punto del DoD que ya no aplica (ej. una de varias invitaciones
// que se canceló) sin afectar los demás puntos ni el estatus de la tarea.
export async function discardDodItem(dodItemId: string, userId: string) {
  const item = await prisma.dodItem.findUnique({ where: { id: dodItemId }, include: { task: true } })
  if (!item || item.task.userId !== userId) throw new Error('dodItem no encontrado')
  await prisma.dodItem.delete({ where: { id: dodItemId } })
}

export async function markTaskDone(taskId: string, userId: string) {
  await assertOwnedTask(taskId, userId)
  const running = await runningEntry(userId)
  if (running?.taskId === taskId) await stopTimer(userId)
  return prisma.task.update({ where: { id: taskId }, data: { estatus: 'done' } })
}

export async function undoTaskDone(taskId: string, userId: string) {
  const task = await assertOwnedTask(taskId, userId)
  const estatus = task.timeEntries.length > 0 ? 'in_progress' : 'planned'
  return prisma.task.update({ where: { id: taskId }, data: { estatus } })
}

export async function markBlockDone(blockId: string, userId: string) {
  await assertOwnedBlock(blockId, userId)
  return prisma.block.update({ where: { id: blockId }, data: { done: true } })
}

export async function undoBlockDone(blockId: string, userId: string) {
  await assertOwnedBlock(blockId, userId)
  return prisma.block.update({ where: { id: blockId }, data: { done: false } })
}

export async function createManualEntry(taskId: string, userId: string, seconds: number) {
  await assertOwnedTask(taskId, userId)
  const now = new Date()
  return prisma.timeEntry.create({
    data: { userId, taskId, startedAt: new Date(now.getTime() - seconds * 1000), stoppedAt: now, seconds, manual: true },
  })
}

export async function editEntry(entryId: string, userId: string, seconds: number) {
  const entry = await prisma.timeEntry.findUnique({ where: { id: entryId } })
  if (!entry || entry.userId !== userId) throw new Error('entry no encontrado')
  return prisma.timeEntry.update({ where: { id: entryId }, data: { seconds, manual: true } })
}
