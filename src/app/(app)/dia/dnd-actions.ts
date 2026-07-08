'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isoWeekOf, weekRange } from '@/lib/dates'

async function uid(): Promise<string> {
  const s = await verifySession()
  if (!s) throw new Error('no autenticado')
  return s.userId
}

async function weekForDate(userId: string, dateStr: string) {
  const isoWeek = isoWeekOf(new Date(dateStr))
  const existing = await prisma.week.findUnique({ where: { userId_isoWeek: { userId, isoWeek } } })
  if (existing) return existing
  const { inicio, fin } = weekRange(isoWeek)
  return prisma.week.create({
    data: { userId, isoWeek, rangoInicio: inicio, rangoFin: fin, factorUsado: 1.4, estatus: 'active' },
  })
}

async function nextOrden(userId: string, dateStr: string): Promise<number> {
  const agg = await prisma.block.aggregate({
    where: { fecha: new Date(dateStr), week: { userId } },
    _max: { orden: true },
  })
  return (agg._max.orden ?? -1) + 1
}

// Agenda un pendiente del backlog a un día: lo pasa a planned y le crea un
// bloque flex (sin hora fija — Mau le pone la hora después). Sirve para el
// drag pendiente→día y para el botón "+ Hoy".
export async function scheduleTaskAction(taskId: string, dateStr: string) {
  const userId = await uid()
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task || task.userId !== userId) throw new Error('task no encontrada')

  const week = await weekForDate(userId, dateStr)
  const orden = await nextOrden(userId, dateStr)
  await prisma.$transaction([
    prisma.task.update({ where: { id: taskId }, data: { estatus: 'planned', weekId: week.id, urgente: false } }),
    prisma.block.create({
      data: {
        weekId: week.id,
        taskId,
        fecha: new Date(dateStr),
        inicio: 'flex',
        fin: 'flex',
        tipo: 'tarea',
        titulo: task.titulo,
        planMin: task.estimadoMin ?? 60,
        orden,
      },
    }),
  ])
  revalidatePath('/dia')
}

// Mueve un bloque a otro día (drag sobre la pestaña de día).
export async function moveBlockAction(blockId: string, dateStr: string) {
  const userId = await uid()
  const block = await prisma.block.findUnique({ where: { id: blockId }, include: { week: true } })
  if (!block || block.week.userId !== userId) throw new Error('block no encontrado')

  const week = await weekForDate(userId, dateStr)
  const orden = await nextOrden(userId, dateStr)
  await prisma.block.update({
    where: { id: blockId },
    data: { fecha: new Date(dateStr), weekId: week.id, orden },
  })
  revalidatePath('/dia')
}

// "Llevar a hoy" — el bloque queda como estaba (mismo estimado/tiempo acumulado,
// el TimeEntry no se toca), solo cambia su fecha y semana al día de hoy.
export async function carryToTodayAction(blockId: string, todayStr: string) {
  await moveBlockAction(blockId, todayStr)
}

export async function carryAllToTodayAction(blockIds: string[], todayStr: string) {
  const userId = await uid()
  const week = await weekForDate(userId, todayStr)
  let orden = await nextOrden(userId, todayStr)
  const blocks = await prisma.block.findMany({ where: { id: { in: blockIds }, week: { userId } } })
  await prisma.$transaction(
    blocks.map((b) =>
      prisma.block.update({ where: { id: b.id }, data: { fecha: new Date(todayStr), weekId: week.id, orden: orden++ } })
    )
  )
  revalidatePath('/dia')
}
