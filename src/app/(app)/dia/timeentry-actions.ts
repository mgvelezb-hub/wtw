'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/auth'
import { createManualEntry, editEntry } from './service'

async function userId(): Promise<string> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')
  return session.userId
}

export async function createManualEntryAction(taskId: string, minutos: number) {
  await createManualEntry(taskId, await userId(), Math.round(minutos * 60))
  revalidatePath('/dia')
}

export async function editEntryAction(entryId: string, minutos: number) {
  await editEntry(entryId, await userId(), Math.round(minutos * 60))
  revalidatePath('/dia')
}
