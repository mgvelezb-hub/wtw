import { prisma } from '@/lib/prisma'
import { runningEntry, stopTimer } from '@/app/api/v1/timer/service'

export type DayBlockView = {
  id: string
  inicio: string
  fin: string
  tipo: string
  titulo: string
  planMin: number
  taskId: string | null
  done: boolean
  dodItems: { id: string; texto: string; done: boolean }[]
  accumulatedSeconds: number
  runningSince: string | null
}

export async function getDayBlocks(userId: string, dateStr: string): Promise<DayBlockView[]> {
  const [blocks, running] = await Promise.all([
    prisma.block.findMany({
      where: { fecha: new Date(dateStr), week: { userId } },
      include: { task: { include: { dodItems: { orderBy: { orden: 'asc' } }, timeEntries: true } } },
      orderBy: { orden: 'asc' },
    }),
    runningEntry(userId),
  ])

  return blocks.map((b) => {
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
    }
  })
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
