import { prisma } from '@/lib/prisma'
import type { Alcance } from '@prisma/client'

export async function listInbox(userId: string) {
  return prisma.task.findMany({ where: { userId, estatus: 'backlog' }, orderBy: { createdAt: 'desc' } })
}

export async function createInboxTask(userId: string, titulo: string, alcance: Alcance = 'sow', dolorCliente?: string) {
  return prisma.task.create({ data: { userId, titulo, alcance, dolorCliente, estatus: 'backlog' } })
}

export async function triageTask(
  taskId: string,
  userId: string,
  data: { weekId?: string; winId?: string; projectId?: string; estimadoMin?: number }
) {
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task || task.userId !== userId) throw new Error('task no encontrada')
  return prisma.task.update({
    where: { id: taskId },
    data: { ...data, estatus: data.weekId ? 'planned' : task.estatus },
  })
}

export async function discardTask(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task || task.userId !== userId) throw new Error('task no encontrada')
  return prisma.task.update({ where: { id: taskId }, data: { estatus: 'deferred' } })
}
