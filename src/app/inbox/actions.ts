'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/auth'
import { createInboxTask, discardTask } from './service'

async function userId(): Promise<string> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')
  return session.userId
}

export async function captureAction(titulo: string) {
  if (!titulo.trim()) return
  await createInboxTask(await userId(), titulo.trim())
  revalidatePath('/inbox')
}

export async function discardAction(taskId: string) {
  await discardTask(taskId, await userId())
  revalidatePath('/inbox')
}
