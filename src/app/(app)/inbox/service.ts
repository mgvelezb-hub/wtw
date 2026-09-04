import { prisma } from '@/lib/prisma'
import type { Alcance, TipoTrabajo } from '@prisma/client'
import { factorPorClase, type FactorClase } from '@/lib/factor-clase'
import { sugerirClase, type TareaEtiquetada } from '@/lib/sugerir-clase'

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

// Los factores por clase de referencia, ya planos y serializables — la página los
// pasa tal cual al Client Component (regla 2: nunca un modelo de Prisma completo).
export async function getFactoresPorClase(userId: string): Promise<Record<TipoTrabajo, FactorClase>> {
  return factorPorClase(userId)
}

// Sugerencia de clase para TODO lo que no la trae. El etiquetado uno por uno es
// justamente la disciplina PMO que la app existe para no hacer a mano: sin un
// camino en lote, el factor por clase se queda sin insumo y nunca calibra.
export async function sugerenciasDeClase(
  userId: string
): Promise<Array<{ id: string; titulo: string; tipo: TipoTrabajo | null; fuente: 'historico' | 'semilla' | null; porque: string | null }>> {
  const [sinClase, etiquetadas] = await Promise.all([
    prisma.task.findMany({
      where: { userId, estatus: 'backlog', tipoTrabajo: null },
      select: { id: true, titulo: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.task.findMany({
      where: { userId, tipoTrabajo: { not: null } },
      select: { titulo: true, tipoTrabajo: true },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
  ])

  // Van TODAS las tareas sin clase, no solo las que reciben sugerencia: la
  // pantalla es el camino para etiquetar en lote, y esconder las que el
  // heurístico no reconoce dejaría fuera justo lo que nadie va a etiquetar solo.
  const historico = etiquetadas as TareaEtiquetada[]
  return sinClase.map((t) => {
    const s = sugerirClase(t.titulo, historico)
    return { id: t.id, titulo: t.titulo, tipo: s?.tipo ?? null, fuente: s?.fuente ?? null, porque: s?.porque ?? null }
  })
}

// Escribe las clases confirmadas. `updateMany` por clase en vez de una por
// tarea: son hasta decenas de filas y el usuario ya aprobó el lote completo.
// Cada update filtra por userId — nunca por id solo (regla 4).
export async function etiquetarClases(
  userId: string,
  pares: Array<{ id: string; tipo: TipoTrabajo }>
): Promise<number> {
  const porTipo = new Map<TipoTrabajo, string[]>()
  for (const p of pares) {
    const lista = porTipo.get(p.tipo)
    if (lista) lista.push(p.id)
    else porTipo.set(p.tipo, [p.id])
  }

  let escritas = 0
  for (const [tipo, ids] of porTipo) {
    const { count } = await prisma.task.updateMany({
      where: { id: { in: ids }, userId },
      data: { tipoTrabajo: tipo },
    })
    escritas += count
  }
  return escritas
}

export async function createInboxTask(
  userId: string,
  data: {
    titulo: string
    herramienta?: string
    tipoTrabajo?: TipoTrabajo
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
      tipoTrabajo: data.tipoTrabajo ?? null,
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
