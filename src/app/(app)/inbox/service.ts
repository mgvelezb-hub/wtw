import { prisma } from '@/lib/prisma'
import type { Alcance } from '@prisma/client'

export const HERRAMIENTAS = [
  'Excel',
  'PowerPoint',
  'Word',
  'Power BI',
  'Python',
  'Visual Studio Code',
  'AnyLogic',
  'Claude',
  'Outlook',
  'Otra',
] as const

export async function listInbox(userId: string) {
  return prisma.task.findMany({
    where: { userId, estatus: 'backlog' },
    include: { project: true },
    orderBy: { createdAt: 'desc' },
  })
}

export async function listProjectsForInbox(userId: string) {
  return prisma.project.findMany({ where: { userId, estatus: 'activo' }, orderBy: { nombre: 'asc' } })
}

// Factor real/estimado por herramienta, calculado de tareas ya terminadas —
// no es una IA que "entiende" la descripción, es la relación real observada
// entre lo que Mau estima y lo que de verdad le toma en cada tipo de tarea.
// Con menos de 2 muestras no hay suficiente señal — se omite en vez de
// sugerir con datos ruidosos.
export async function getHerramientaFactors(userId: string): Promise<Record<string, number>> {
  const tasks = await prisma.task.findMany({
    where: { userId, estatus: 'done', herramienta: { not: null }, estimadoMin: { not: null } },
    include: { timeEntries: { where: { stoppedAt: { not: null } } } },
  })

  const porHerramienta = new Map<string, { estimado: number; real: number; n: number }>()
  for (const t of tasks) {
    if (!t.herramienta || !t.estimadoMin) continue
    const realMin = t.timeEntries.reduce((s, e) => s + e.seconds, 0) / 60
    if (realMin === 0) continue
    const acc = porHerramienta.get(t.herramienta) ?? { estimado: 0, real: 0, n: 0 }
    acc.estimado += t.estimadoMin
    acc.real += realMin
    acc.n += 1
    porHerramienta.set(t.herramienta, acc)
  }

  const factores: Record<string, number> = {}
  for (const [herramienta, acc] of porHerramienta) {
    if (acc.n >= 2 && acc.estimado > 0) factores[herramienta] = acc.real / acc.estimado
  }
  return factores
}

export async function createInboxTask(
  userId: string,
  data: {
    titulo: string
    herramienta?: string
    projectId?: string
    estimadoMin?: number
    alcance?: Alcance
    dolorCliente?: string
  }
) {
  return prisma.task.create({
    data: {
      userId,
      titulo: data.titulo,
      herramienta: data.herramienta || null,
      projectId: data.projectId || null,
      estimadoMin: data.estimadoMin ?? null,
      alcance: data.alcance ?? 'sow',
      dolorCliente: data.dolorCliente || null,
      estatus: 'backlog',
    },
  })
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
