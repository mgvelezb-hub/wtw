'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/auth'
import { startTimer, stopTimer } from '@/app/api/v1/timer/service'
import { toggleDodItem, markTaskDone, undoTaskDone, markBlockDone, undoBlockDone } from './service'

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

export async function toggleDodItemAction(dodItemId: string) {
  await toggleDodItem(dodItemId, await userId())
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
