'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/auth'
import { startTimer, stopTimer, cancelTimer } from '@/app/api/v1/timer/service'
import { syncCalendar } from '@/app/api/v1/calendar/service'
import { prisma } from '@/lib/prisma'
import { toggleDodItem, discardDodItem, markTaskDone, undoTaskDone, markBlockDone, undoBlockDone } from './service'
import { delegarTarea, deshacerDelegacion } from './delegacion-service'

async function userId(): Promise<string> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')
  return session.userId
}

export async function startTimerAction(taskId: string) {
  await startTimer(await userId(), taskId)
  revalidatePath('/dia')
}

export async function stopTimerAction() {
  await stopTimer(await userId())
  revalidatePath('/dia')
}

// Descarta la corrida actual (se inició por error) y regresa la tarea a planeada.
export async function cancelTimerAction(taskId: string) {
  const uid = await userId()
  await cancelTimer(uid)
  await prisma.task.update({ where: { id: taskId }, data: { estatus: 'planned' } })
  revalidatePath('/dia')
}

export async function toggleDodItemAction(dodItemId: string) {
  await toggleDodItem(dodItemId, await userId())
  revalidatePath('/dia')
}

export async function discardDodItemAction(dodItemId: string) {
  await discardDodItem(dodItemId, await userId())
  revalidatePath('/dia')
}

export async function markTaskDoneAction(taskId: string) {
  await markTaskDone(taskId, await userId())
  revalidatePath('/dia')
}

export async function undoTaskDoneAction(taskId: string) {
  await undoTaskDone(taskId, await userId())
  revalidatePath('/dia')
}

export async function markBlockDoneAction(blockId: string) {
  await markBlockDone(blockId, await userId())
  revalidatePath('/dia')
}

export async function undoBlockDoneAction(blockId: string) {
  await undoBlockDone(blockId, await userId())
  revalidatePath('/dia')
}

// Arranque manual del día: refresca las juntas reales de Outlook antes de
// empezar a trabajar (en vez de depender de un sync automático por hora).
export async function startDayAction() {
  const uid = await userId()
  const user = await prisma.user.findUnique({ where: { id: uid }, select: { icsUrl: true } })
  if (!user?.icsUrl) return { synced: 0 }
  const result = await syncCalendar(uid)
  revalidatePath('/dia')
  return result
}

// Delegar de verdad: sale de la carga de Mau pero sigue visible como compromiso
// de un tercero. Distinto de marcarDelegableAction, que es la bitácora de "la
// hice yo y debió hacerla alguien más junior".
export async function delegarTareaAction(taskId: string, delegadoA: string) {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')
  await delegarTarea(taskId, session.userId, delegadoA)
  revalidatePath('/dia')
  revalidatePath('/semana')
  revalidatePath('/desarrollo')
}

export async function deshacerDelegacionAction(taskId: string) {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')
  await deshacerDelegacion(taskId, session.userId)
  revalidatePath('/dia')
  revalidatePath('/semana')
  revalidatePath('/desarrollo')
}
